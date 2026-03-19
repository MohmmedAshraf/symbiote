import * as THREE from 'three';
import type { CortexGraphData } from '@/lib/cortex-types';
import type { SymbioteEvent } from '@/lib/events';
import { getCommunityColor } from '@/lib/palette';
import {
    OUTER_RADIUS,
    INNER_RADIUS,
    OUTER_COUNT,
    INNER_COUNT,
    MAX_RIPPLES,
    MAX_ACTIVE_NEURONS,
    SIGNAL_POOL_SIZE,
    PULSE_RING_POOL,
    PULSE_RING_DOTS,
} from './brain-types';
import type { Lobe, SignalAnimation, SignalWave, FeedItem, BrainState } from './brain-types';
import {
    outerVertexShader,
    outerFragmentShader,
    innerVertexShader,
    innerFragmentShader,
    lineVertexShader,
    lineFragmentShader,
    ringVertexShader,
    ringFragmentShader,
} from './brain-shaders';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class BrainRenderer {
    private container: HTMLElement;
    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    private world = new THREE.Group();
    private synapseGroup = new THREE.Group();
    private photonGroup = new THREE.Group();

    private innerMaterial!: THREE.ShaderMaterial;
    private outerMaterial!: THREE.ShaderMaterial;

    private lobes: Lobe[] = [];
    private lobeCount = 0;
    private fileToCommunity = new Map<string, number>();
    private nodeIdToCommunity = new Map<string, number>();

    private signalPool: SignalAnimation[] = [];
    private signalPoolIndex = 0;
    private pulseRings: THREE.Points[] = [];
    private pulseRingIndex = 0;

    private ripplePositions: THREE.Vector3[];
    private rippleProgress: Float32Array;
    private rippleColors: THREE.Color[];
    private rippleIndex = 0;

    private lobeHypertrophy: Float32Array;
    private lobeMemory: Float32Array;
    private lobeActivity: Float32Array;

    private activeNeuronPositions: THREE.Vector3[];
    private activeNeuronColors: THREE.Color[];
    private activeNeuronStrength: Float32Array;
    private activeNeuronCount = 0;

    private innerPositions: Float32Array | null = null;

    private signalWaves: SignalWave[] = [];
    private zoom = 580;
    private targetZoom = 580;
    private isDragging = false;

    private velocity = 0;
    private targetVelocity = 0;
    private smoothedVelocity = 0;
    private consciousness = 0;
    private totalEvents = 0;

    private animationId = 0;
    private isPlaying = true;

    private onStateUpdate: (state: BrainState) => void;

    constructor(container: HTMLElement, onStateUpdate: (state: BrainState) => void) {
        this.container = container;
        this.onStateUpdate = onStateUpdate;

        this.ripplePositions = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3());
        this.rippleProgress = new Float32Array(MAX_RIPPLES);
        this.rippleColors = Array.from({ length: MAX_RIPPLES }, () => new THREE.Color());

        this.lobeHypertrophy = new Float32Array(8);
        this.lobeMemory = new Float32Array(8);
        this.lobeActivity = new Float32Array(8);

        this.activeNeuronPositions = Array.from(
            { length: MAX_ACTIVE_NEURONS },
            () => new THREE.Vector3(),
        );
        this.activeNeuronColors = Array.from(
            { length: MAX_ACTIVE_NEURONS },
            () => new THREE.Color(),
        );
        this.activeNeuronStrength = new Float32Array(MAX_ACTIVE_NEURONS);
    }

    init(graphData: CortexGraphData): void {
        this.buildLookups(graphData);
        this.buildLobes(graphData);
        this.setupScene();
        this.createOuterShell();
        this.createInnerCortex();
        this.createSignalPool();
        this.createPulseRings();
        this.bindInteraction();
        this.animate();
    }

    private buildLookups(graphData: CortexGraphData): void {
        const communityFiles = new Map<string, Map<number, number>>();

        for (const node of graphData.nodes) {
            if (node.community !== null) {
                this.nodeIdToCommunity.set(node.id, node.community);

                if (!communityFiles.has(node.filePath)) {
                    communityFiles.set(node.filePath, new Map());
                }
                const counts = communityFiles.get(node.filePath)!;
                counts.set(node.community, (counts.get(node.community) ?? 0) + 1);
            }
        }

        for (const [filePath, counts] of communityFiles) {
            let maxCount = 0;
            let dominant = 0;
            for (const [community, count] of counts) {
                if (count > maxCount) {
                    maxCount = count;
                    dominant = community;
                }
            }
            this.fileToCommunity.set(filePath, dominant);
        }
    }

    private buildLobes(graphData: CortexGraphData): void {
        const communityCount = Math.max(graphData.communityCount, 1);
        this.lobeCount = Math.min(communityCount, 8);

        const communitySizes = new Map<number, number>();
        for (const node of graphData.nodes) {
            if (node.community !== null) {
                communitySizes.set(node.community, (communitySizes.get(node.community) ?? 0) + 1);
            }
        }

        const sortedCommunities = [...communitySizes.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, this.lobeCount);

        const lobeNames = [
            'Frontal Cortex',
            'Parietal Cortex',
            'Temporal Cortex',
            'Occipital Cortex',
            'Limbic Cortex',
            'Prefrontal Cortex',
            'Motor Cortex',
            'Sensory Cortex',
        ];

        this.lobes = sortedCommunities.map(([community, nodeCount], i) => {
            const phi = Math.acos(1 - (2 * (i + 0.5)) / this.lobeCount);
            const theta = GOLDEN_ANGLE * i;
            const pos = new THREE.Vector3(
                INNER_RADIUS * Math.sin(phi) * Math.cos(theta),
                INNER_RADIUS * Math.cos(phi),
                INNER_RADIUS * Math.sin(phi) * Math.sin(theta),
            );

            return {
                index: i,
                name: lobeNames[i] ?? `Cortex ${i + 1}`,
                color: getCommunityColor(community),
                community,
                position: pos,
                nodeCount,
            };
        });

        this.lobeActivity = new Float32Array(this.lobeCount);
    }

    private setupScene(): void {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000108);

        this.camera = new THREE.PerspectiveCamera(30, w / h, 1, 5000);
        this.camera.position.z = this.zoom;

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
        });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.scene.add(this.world);
        this.world.add(this.synapseGroup);
        this.world.add(this.photonGroup);
    }

    private createOuterShell(): void {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(OUTER_COUNT * 3);
        const col = new Float32Array(OUTER_COUNT * 3);
        const sizes = new Float32Array(OUTER_COUNT);
        const stars = new Float32Array(OUTER_COUNT);
        const activation = new Float32Array(OUTER_COUNT);

        for (let i = 0; i < OUTER_COUNT; i++) {
            const phi = Math.acos(-1 + (2 * i) / OUTER_COUNT);
            const theta = Math.sqrt(OUTER_COUNT * Math.PI) * phi;

            pos[i * 3] = OUTER_RADIUS * Math.cos(theta) * Math.sin(phi);
            pos[i * 3 + 1] = OUTER_RADIUS * Math.sin(theta) * Math.sin(phi);
            pos[i * 3 + 2] = OUTER_RADIUS * Math.cos(phi);

            stars[i] = Math.pow(Math.random(), 6);
            activation[i] = 0;

            const land =
                Math.sin(theta * 0.05) * Math.cos((90 - (phi * 180) / Math.PI) * 0.08) > -0.2;
            if (land) {
                col[i * 3] = 0.02;
                col[i * 3 + 1] = 0.08;
                col[i * 3 + 2] = 0.2;
                sizes[i] = 0.5;
            } else {
                col[i * 3] = 0.01;
                col[i * 3 + 1] = 0.03;
                col[i * 3 + 2] = 0.1;
                sizes[i] = 0.25;
            }
        }

        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('aBaseColor', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geo.setAttribute('aStars', new THREE.BufferAttribute(stars, 1));
        geo.setAttribute('aActivation', new THREE.BufferAttribute(activation, 1));

        this.outerMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uStress: { value: 0 },
                uConsciousness: { value: 0 },
                uMoodInfluence: { value: 0 },
            },
            vertexShader: outerVertexShader,
            fragmentShader: outerFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.world.add(new THREE.Points(geo, this.outerMaterial));
    }

    private createInnerCortex(): void {
        const geo = new THREE.BufferGeometry();
        const inPos = new Float32Array(INNER_COUNT * 3);
        const inCol = new Float32Array(INNER_COUNT * 3);
        const inSizes = new Float32Array(INNER_COUNT);
        const inStars = new Float32Array(INNER_COUNT);

        for (let i = 0; i < INNER_COUNT; i++) {
            const phi = Math.acos(-1 + (2 * i) / INNER_COUNT);
            const theta = Math.sqrt(INNER_COUNT * Math.PI) * phi;

            const fold = Math.sin(phi * 12) * Math.cos(theta * 10) * 0.15;
            const r = INNER_RADIUS * (1 + fold);

            inPos[i * 3] = r * Math.cos(theta) * Math.sin(phi);
            inPos[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
            inPos[i * 3 + 2] = r * Math.cos(phi);

            inStars[i] = Math.pow(Math.random(), 4);
            inSizes[i] = 1;

            const nv = new THREE.Vector3(inPos[i * 3], inPos[i * 3 + 1], inPos[i * 3 + 2]);

            let closestLobe = this.lobes[0];
            let minDist = Infinity;
            for (const lobe of this.lobes) {
                const d = nv.distanceTo(lobe.position);
                if (d < minDist) {
                    minDist = d;
                    closestLobe = lobe;
                }
            }

            const c = new THREE.Color(closestLobe?.color ?? '#10b981');
            inCol[i * 3] = c.r * 0.5;
            inCol[i * 3 + 1] = c.g * 0.5;
            inCol[i * 3 + 2] = c.b * 0.5;
        }

        this.innerPositions = inPos;

        geo.setAttribute('position', new THREE.BufferAttribute(inPos, 3));
        geo.setAttribute('aBaseColor', new THREE.BufferAttribute(inCol, 3));
        geo.setAttribute('aSize', new THREE.BufferAttribute(inSizes, 1));
        geo.setAttribute('aStars', new THREE.BufferAttribute(inStars, 1));

        const lobePosArr = Array.from(
            { length: 8 },
            (_, i) => this.lobes[i]?.position ?? new THREE.Vector3(),
        );

        this.innerMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uStress: { value: 0 },
                uConsciousness: { value: 0 },
                uDreaming: { value: 0 },
                uMoodInfluence: { value: 0 },
                uMoodColor: { value: new THREE.Color(0.3, 0.3, 0.3) },
                uRipplesPos: { value: this.ripplePositions },
                uRipplesProgress: { value: this.rippleProgress },
                uRipplesColor: { value: this.rippleColors },
                uLobePos: { value: lobePosArr },
                uLobeHypertrophy: { value: this.lobeHypertrophy },
                uLobeMemory: { value: this.lobeMemory },
                uLobeCount: { value: this.lobeCount },
                uActiveNeurons: { value: this.activeNeuronPositions },
                uActiveColors: { value: this.activeNeuronColors },
                uActiveStrength: { value: this.activeNeuronStrength },
                uActiveCount: { value: 0 },
            },
            vertexShader: innerVertexShader,
            fragmentShader: innerFragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.world.add(new THREE.Points(geo, this.innerMaterial));
    }

    private createSignalPool(): void {
        for (let i = 0; i < SIGNAL_POOL_SIZE; i++) {
            const dummyPoints = new Float32Array(51 * 3);
            const ratios = new Float32Array(51);
            for (let r = 0; r <= 50; r++) ratios[r] = r / 50;

            const lineGeo = new THREE.BufferGeometry();
            lineGeo.setAttribute('position', new THREE.BufferAttribute(dummyPoints, 3));
            lineGeo.setAttribute('aRatio', new THREE.BufferAttribute(ratios, 1));

            const lineMat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uColor: { value: new THREE.Color() },
                    uProgress: { value: 0 },
                    uDecay: { value: 1 },
                },
                vertexShader: lineVertexShader,
                fragmentShader: lineFragmentShader,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });

            const line = new THREE.Line(lineGeo, lineMat);
            line.visible = false;
            this.synapseGroup.add(line);

            const packet = new THREE.Mesh(
                new THREE.SphereGeometry(1.5, 6, 6),
                new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    transparent: true,
                }),
            );
            packet.visible = false;
            this.photonGroup.add(packet);

            this.signalPool.push({
                state: 'idle',
                progress: 0,
                decay: 1,
                trail: line,
                packet,
                p0: new THREE.Vector3(),
                p1: new THREE.Vector3(),
                p2: new THREE.Vector3(),
            });
        }
    }

    private createPulseRings(): void {
        for (let i = 0; i < PULSE_RING_POOL; i++) {
            const pos = new Float32Array(PULSE_RING_DOTS * 3);
            const col = new Float32Array(PULSE_RING_DOTS * 3);

            for (let d = 0; d < PULSE_RING_DOTS; d++) {
                const angle = (d / PULSE_RING_DOTS) * Math.PI * 2;
                pos[d * 3] = Math.cos(angle);
                pos[d * 3 + 1] = Math.sin(angle);
                pos[d * 3 + 2] = 0;
                col[d * 3] = 1;
                col[d * 3 + 1] = 1;
                col[d * 3 + 2] = 1;
            }

            const ringGeo = new THREE.BufferGeometry();
            ringGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            ringGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

            const ringMat = new THREE.ShaderMaterial({
                uniforms: {
                    uRadius: { value: 0.5 },
                    uOpacity: { value: 0 },
                },
                vertexShader: ringVertexShader,
                fragmentShader: ringFragmentShader,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });

            const ring = new THREE.Points(ringGeo, ringMat);
            ring.visible = false;
            ring.userData.speed = 1.0;
            this.world.add(ring);
            this.pulseRings.push(ring);
        }
    }

    private bindInteraction(): void {
        const canvas = this.renderer.domElement;

        canvas.addEventListener('mousedown', () => {
            this.isDragging = true;
        });
        canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
        canvas.addEventListener('mousemove', (e: MouseEvent) => {
            if (this.isDragging) {
                this.world.rotation.y += e.movementX * 0.003;
                this.world.rotation.x += e.movementY * 0.003;
            }
        });

        canvas.addEventListener(
            'wheel',
            (e: WheelEvent) => {
                e.preventDefault();
                this.targetZoom = Math.max(10, Math.min(3000, this.targetZoom + e.deltaY * 0.8));
            },
            { passive: false },
        );

        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === '+' || e.key === '=')
                this.targetZoom = Math.max(10, this.targetZoom - 50);
            if (e.key === '-') this.targetZoom = Math.min(3000, this.targetZoom + 50);
            if (e.key === '0') this.targetZoom = 580;
        });

        window.addEventListener('resize', () => this.resize());
    }

    processEvent(event: SymbioteEvent): FeedItem | null {
        const community = this.resolveCommunity(event);
        if (community === null) return null;

        const lobe =
            this.lobes.find((l) => l.community === community) ??
            this.lobes[community % this.lobeCount] ??
            this.lobes[0];

        if (!lobe) return null;

        this.totalEvents++;
        this.targetVelocity = Math.min(120, this.targetVelocity * 0.4 + 30);

        const color = lobe.color;
        this.fireRipple(lobe, color);
        this.fireSignal(lobe, color);
        this.firePulseRing(lobe, color);

        this.lobeHypertrophy[lobe.index] = Math.min(4.0, this.lobeHypertrophy[lobe.index] + 0.3);
        this.lobeMemory[lobe.index] = Math.min(5.0, this.lobeMemory[lobe.index] + 0.15);
        this.lobeActivity[lobe.index] = 1.0;

        if (Math.random() < 0.45) {
            const reflIdx = Math.floor(Math.random() * this.lobeCount);
            if (reflIdx !== lobe.index) {
                const reflLobe = this.lobes[reflIdx];
                if (reflLobe) {
                    setTimeout(
                        () => {
                            this.fireRipple(reflLobe, reflLobe.color);
                            this.lobeHypertrophy[reflLobe.index] = Math.min(
                                4.0,
                                this.lobeHypertrophy[reflLobe.index] + 0.2,
                            );
                        },
                        150 + Math.random() * 250,
                    );
                }
            }
        }

        this.initiateSignalWave(lobe, color, event.data?.filePath);

        const typeLabel = event.type.replace(':', ' ').toUpperCase();

        return {
            id: Date.now() + Math.random(),
            type: typeLabel,
            filePath: event.data?.filePath ?? 'unknown',
            lobe: lobe.name,
            color,
            timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            }),
        };
    }

    private resolveCommunity(event: SymbioteEvent): number | null {
        if (event.data?.community !== undefined) {
            return event.data.community;
        }
        if (event.data?.nodeIds?.length) {
            const c = this.nodeIdToCommunity.get(event.data.nodeIds[0]);
            if (c !== undefined) return c;
        }
        if (event.data?.filePath) {
            const c = this.fileToCommunity.get(event.data.filePath);
            if (c !== undefined) return c;
        }
        return this.lobes.length > 0
            ? this.lobes[Math.floor(Math.random() * this.lobeCount)].community
            : null;
    }

    private fireRipple(lobe: Lobe, color: string): void {
        const idx = this.rippleIndex;
        this.ripplePositions[idx].copy(lobe.position);
        this.rippleProgress[idx] = 0.01;
        this.rippleColors[idx].set(color);
        this.rippleIndex = (this.rippleIndex + 1) % MAX_RIPPLES;
    }

    private fireSignal(lobe: Lobe, color: string): void {
        const anim = this.signalPool[this.signalPoolIndex];
        this.signalPoolIndex = (this.signalPoolIndex + 1) % this.signalPool.length;

        const hypertrophy = this.lobeHypertrophy[lobe.index];
        const targetPos = lobe.position
            .clone()
            .normalize()
            .multiplyScalar(INNER_RADIUS + hypertrophy * 15);
        const perp = new THREE.Vector3(-targetPos.y, targetPos.x, 0)
            .normalize()
            .multiplyScalar((Math.random() - 0.5) * 20);
        const mid = targetPos.clone().multiplyScalar(0.4).add(perp);

        anim.p0.set(0, 0, 0);
        anim.p1.copy(mid);
        anim.p2.copy(targetPos);

        const positions = (anim.trail.geometry as THREE.BufferGeometry).attributes.position
            .array as Float32Array;
        for (let j = 0; j <= 50; j++) {
            const t = j / 50;
            const mt = 1 - t;
            positions[j * 3] = mt * mt * anim.p0.x + 2 * mt * t * anim.p1.x + t * t * anim.p2.x;
            positions[j * 3 + 1] = mt * mt * anim.p0.y + 2 * mt * t * anim.p1.y + t * t * anim.p2.y;
            positions[j * 3 + 2] = mt * mt * anim.p0.z + 2 * mt * t * anim.p1.z + t * t * anim.p2.z;
        }
        (anim.trail.geometry as THREE.BufferGeometry).attributes.position.needsUpdate = true;

        const mat = anim.trail.material as THREE.ShaderMaterial;
        mat.uniforms.uColor.value.set(color);
        mat.uniforms.uProgress.value = 0;
        mat.uniforms.uDecay.value = 1.0;
        anim.trail.visible = true;
        anim.progress = 0;
        anim.decay = 1.0;
        anim.state = 'moving';
        anim.packet.visible = false;
    }

    private firePulseRing(lobe: Lobe, color: string): void {
        const ring = this.pulseRings[this.pulseRingIndex];
        this.pulseRingIndex = (this.pulseRingIndex + 1) % this.pulseRings.length;

        const c = new THREE.Color(color);
        const colArr = (ring.geometry as THREE.BufferGeometry).attributes.color
            .array as Float32Array;
        for (let ci = 0; ci < colArr.length; ci += 3) {
            colArr[ci] = c.r;
            colArr[ci + 1] = c.g;
            colArr[ci + 2] = c.b;
        }
        (ring.geometry as THREE.BufferGeometry).attributes.color.needsUpdate = true;

        const mat = ring.material as THREE.ShaderMaterial;
        mat.uniforms.uOpacity.value = 0.95;
        mat.uniforms.uRadius.value = 0.5;
        ring.userData.speed = 1.4 + Math.random() * 0.8;

        ring.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            lobe.position.clone().normalize(),
        );
        ring.visible = true;
    }

    private initiateSignalWave(lobe: Lobe, color: string, filePath?: string): void {
        if (!this.innerPositions) return;

        const startPos = filePath
            ? this.getPersistenceCoords(filePath)
            : new THREE.Vector3(0, 0, 0);

        const wave: SignalWave = {
            id: Date.now() + Math.random(),
            color: new THREE.Color(color),
            startPos,
            targetLobe: lobe,
            progress: 0,
            speed: 0.04,
        };

        this.signalWaves.push(wave);
        if (this.signalWaves.length > 20) this.signalWaves.shift();
    }

    private getPersistenceCoords(name: string): THREE.Vector3 {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const lat = (Math.abs(hash) % 150) - 75;
        const lon = (Math.abs(hash >> 8) % 360) - 180;
        const phi = ((90 - lat) * Math.PI) / 180;
        const theta = ((lon + 180) * Math.PI) / 180;
        return new THREE.Vector3(
            -OUTER_RADIUS * Math.sin(phi) * Math.cos(theta),
            OUTER_RADIUS * Math.cos(phi),
            OUTER_RADIUS * Math.sin(phi) * Math.sin(theta),
        );
    }

    private updateSignalWaves(): void {
        if (!this.innerPositions) return;

        this.activeNeuronCount = 0;

        for (let w = this.signalWaves.length - 1; w >= 0; w--) {
            const wave = this.signalWaves[w];
            wave.progress += wave.speed;

            if (wave.progress >= 1.0) {
                this.signalWaves.splice(w, 1);
                continue;
            }

            const currentPos = new THREE.Vector3().lerpVectors(
                wave.startPos,
                wave.targetLobe.position,
                wave.progress,
            );

            const sampleSize = Math.max(1, Math.floor(INNER_COUNT / 3000));
            for (let i = 0; i < Math.min(INNER_COUNT, 5000); i += sampleSize) {
                const neuronPos = new THREE.Vector3(
                    this.innerPositions[i * 3],
                    this.innerPositions[i * 3 + 1],
                    this.innerPositions[i * 3 + 2],
                );
                const dist = neuronPos.distanceTo(currentPos);
                if (dist < 20 && this.activeNeuronCount < MAX_ACTIVE_NEURONS) {
                    const strength = 1.0 - dist / 20;
                    this.activeNeuronPositions[this.activeNeuronCount].copy(neuronPos);
                    this.activeNeuronColors[this.activeNeuronCount].copy(wave.color);
                    this.activeNeuronStrength[this.activeNeuronCount] = strength * 0.9;
                    this.activeNeuronCount++;
                }
            }
        }
    }

    private animate = (): void => {
        this.animationId = requestAnimationFrame(this.animate);

        if (!this.isPlaying) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        if (!this.isDragging) {
            this.world.rotation.y += 0.00025;
        }

        const totalHypertrophy = Array.from(this.lobeHypertrophy).reduce((a, b) => a + b, 0);
        const evolutionZoom =
            580 + totalHypertrophy * 25 + this.smoothedVelocity * 3 + this.consciousness * 100;
        if (Math.abs(this.targetZoom - 580) < 10) {
            this.targetZoom = evolutionZoom;
        }
        this.zoom += (this.targetZoom - this.zoom) * 0.08;
        this.camera.position.z = this.zoom;

        this.smoothedVelocity += (this.targetVelocity - this.smoothedVelocity) * 0.06;
        this.targetVelocity *= 0.97;

        const currentStress = this.smoothedVelocity / 100;
        const globalTime = performance.now() * 0.001;

        this.outerMaterial.uniforms.uTime.value = globalTime;
        this.outerMaterial.uniforms.uStress.value = currentStress;
        this.outerMaterial.uniforms.uConsciousness.value = this.consciousness;
        this.outerMaterial.uniforms.uMoodInfluence.value = this.smoothedVelocity / 150;

        this.innerMaterial.uniforms.uTime.value = globalTime;
        this.innerMaterial.uniforms.uStress.value = currentStress;
        this.innerMaterial.uniforms.uConsciousness.value = this.consciousness;
        this.innerMaterial.uniforms.uDreaming.value = 0;
        this.innerMaterial.uniforms.uMoodInfluence.value = this.smoothedVelocity / 150;
        this.innerMaterial.uniforms.uActiveCount.value = this.activeNeuronCount;

        for (let i = 0; i < this.lobeCount; i++) {
            this.lobeHypertrophy[i] = Math.max(0, this.lobeHypertrophy[i] - 0.004);
            this.lobeMemory[i] = Math.max(0, this.lobeMemory[i] - 0.002);
            this.lobeActivity[i] *= 0.95;
        }

        for (let i = 0; i < MAX_RIPPLES; i++) {
            if (this.rippleProgress[i] > 0 && this.rippleProgress[i] < 1) {
                this.rippleProgress[i] += 0.003;
            }
        }

        for (const anim of this.signalPool) {
            if (anim.state === 'idle') continue;

            const mat = anim.trail.material as THREE.ShaderMaterial;
            mat.uniforms.uTime.value = globalTime;

            if (anim.state === 'moving') {
                anim.progress += 0.05;
                if (anim.progress >= 1) {
                    anim.state = 'decaying';
                    anim.packet.visible = false;
                } else {
                    mat.uniforms.uProgress.value = anim.progress;
                }
            } else if (anim.state === 'decaying') {
                anim.decay -= 0.03;
                mat.uniforms.uDecay.value = anim.decay;
                if (anim.decay <= 0) {
                    anim.state = 'idle';
                    anim.trail.visible = false;
                }
            }
        }

        for (const ring of this.pulseRings) {
            if (!ring.visible) continue;
            const mat = ring.material as THREE.ShaderMaterial;
            const r = mat.uniforms.uRadius.value + ring.userData.speed * 0.55;
            mat.uniforms.uRadius.value = r;
            mat.uniforms.uOpacity.value = Math.max(0, 0.95 * (1.0 - r / INNER_RADIUS));
            if (r >= INNER_RADIUS) {
                ring.visible = false;
                mat.uniforms.uRadius.value = 0.5;
                mat.uniforms.uOpacity.value = 0;
            }
        }

        this.updateSignalWaves();
        this.velocity = Math.round(this.smoothedVelocity);

        this.onStateUpdate({
            velocity: this.velocity,
            eventCount: this.totalEvents,
            consciousness: this.consciousness,
            lobeActivity: Array.from(this.lobeActivity),
            activeLobe: this.signalWaves[0]?.targetLobe.name ?? null,
            activeSignal: this.signalWaves[0] ? `→ ${this.signalWaves[0].targetLobe.name}` : null,
            signalProgress: this.signalWaves[0]
                ? Math.round(this.signalWaves[0].progress * 100)
                : 0,
        });

        this.renderer.render(this.scene, this.camera);
    };

    resize(): void {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    setPlaying(playing: boolean): void {
        this.isPlaying = playing;
    }

    setZoom(zoom: number): void {
        this.targetZoom = zoom;
    }

    getLobes(): Lobe[] {
        return this.lobes;
    }

    dispose(): void {
        cancelAnimationFrame(this.animationId);
        this.renderer.dispose();
        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
    }
}
