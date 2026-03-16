import {
    useState,
    useMemo,
    useCallback,
    useRef,
    useEffect,
    useImperativeHandle,
    forwardRef,
    Suspense,
    Component,
    type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { GraphData, GraphNode, LayoutNode } from '@/lib/types';
import type { NodeEffect } from './event-effects';

export interface BrainSceneHandle {
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
}
import { NodeLabel } from './node-label';
import brainCurvesData from './brain-curves.json';

interface BrainSceneProps {
    data: GraphData;
    onNodeClick: (nodeId: string) => void;
    selectedNodeId: string | null;
    getActiveEffects?: () => Map<string, NodeEffect>;
}

const BRAIN_COLOR = new THREE.Color('#7b5fff');
const FLASH_AMP = 3;
const MOUSE_AMP = 0.016;
const OP_RAMP = 0.05;

function BrainTubes() {
    const groupRef = useRef<THREE.Group>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const mouseTarget = useRef(new THREE.Vector4(0, 0, 0, 0));
    const mouseSmoothed = useRef(new THREE.Vector4(0, 0, 0, 0));
    const { camera, raycaster, pointer } = useThree();

    const colliderSphere = useMemo(() => {
        const geo = new THREE.SphereGeometry(0.085, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ visible: false });
        return new THREE.Mesh(geo, mat);
    }, []);

    const { geometries, material } = useMemo(() => {
        const paths = brainCurvesData as number[][];
        const geos: THREE.BufferGeometry[] = [];

        for (const flat of paths) {
            const pts: THREE.Vector3[] = [];
            for (let i = 0; i < flat.length; i += 3) {
                pts.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
            }
            const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
            const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.00025, 3, false);

            const posCount = tubeGeo.attributes.position.count;
            const progressAttr = new Float32Array(posCount * 2);
            const uvs = tubeGeo.attributes.uv;

            for (let i = 0; i < posCount; i++) {
                progressAttr[i * 2] = uvs.getX(i);
                progressAttr[i * 2 + 1] = Math.random() * Math.PI * 2;
            }
            tubeGeo.setAttribute('progress', new THREE.BufferAttribute(progressAttr, 2));
            geos.push(tubeGeo);
        }

        const mat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            vertexShader: /* glsl */ `
                attribute vec2 progress;

                uniform float time;
                uniform vec4 mouseT;
                uniform float flashAmp;
                uniform float mouseAmp;

                varying float vProg;
                varying float vProgress;
                varying float d;

                void main() {
                    vec3 p = position;

                    vProg = smoothstep(-1.0, 1.0, sin(progress.y + progress.x * 6.0 + time * flashAmp));
                    vProgress = progress.x;

                    float dist = distance(p, mouseT.xyz);
                    if (dist < mouseT.w) {
                        vec3 v = normalize(p - mouseT.xyz);
                        v *= (1.0 - dist / mouseT.w);
                        p += v * mouseAmp;
                    }

                    vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
                    gl_Position = projectionMatrix * mvPos;

                    d = 0.0;
                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 color;
                uniform float opRamp;
                uniform bool glow;

                varying float d;
                varying float vProg;
                varying float vProgress;

                void main() {
                    vec3 c = mix(color * 0.15, color * 2.5, vProg);

                    float opacity = 0.9 * min(
                        smoothstep(0.0, opRamp, vProgress),
                        1.0 - smoothstep(1.0 - opRamp, 1.0, vProgress)
                    );

                    gl_FragColor = vec4(c * opacity, opacity);
                }
            `,
            uniforms: {
                time: { value: 0 },
                mouseT: { value: new THREE.Vector4(0, 0, 0, 0) },
                color: { value: new THREE.Vector3(BRAIN_COLOR.r, BRAIN_COLOR.g, BRAIN_COLOR.b) },
                flashAmp: { value: FLASH_AMP },
                mouseAmp: { value: MOUSE_AMP },
                opRamp: { value: OP_RAMP },
                glow: { value: false },
            },
        });

        return { geometries: geos, material: mat };
    }, []);

    useFrame(({ clock }) => {
        if (materialRef.current) {
            materialRef.current.uniforms.time.value = clock.getElapsedTime();
        }

        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(colliderSphere);
        if (hits.length > 0) {
            const p = hits[0].point;
            mouseTarget.current.set(p.x, p.y, p.z, 0.04);
        } else {
            mouseTarget.current.w *= 0.95;
        }

        mouseSmoothed.current.lerp(mouseTarget.current, 0.1);
        if (materialRef.current) {
            materialRef.current.uniforms.mouseT.value.copy(mouseSmoothed.current);
        }
    });

    return (
        <group ref={groupRef}>
            <primitive object={colliderSphere} />
            {geometries.map((geo, i) => (
                <mesh key={i} geometry={geo}>
                    <primitive
                        object={material}
                        ref={i === 0 ? materialRef : undefined}
                        attach="material"
                    />
                </mesh>
            ))}
        </group>
    );
}

interface MappedNode {
    node: GraphNode;
    position: THREE.Vector3;
}

function mapNodesToBrain(nodes: GraphNode[]): MappedNode[] {
    const paths = brainCurvesData as number[][];
    const curves: THREE.CatmullRomCurve3[] = paths.map((flat) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < flat.length; i += 3) {
            pts.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
        }
        return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    });

    return nodes.map((node, i) => {
        const curveIdx = i % curves.length;
        const t = (i / nodes.length) * 0.9 + 0.05;
        const pos = curves[curveIdx].getPointAt(t);
        return { node, position: pos };
    });
}

interface CodeNodesProps {
    data: GraphData;
    selectedId: string | null;
    onNodeClick: (id: string) => void;
    onNodeHover: (id: string | null, pos: { x: number; y: number } | null) => void;
    getActiveEffects?: () => Map<string, NodeEffect>;
}

function CodeNodes({
    data,
    selectedId,
    onNodeClick,
    onNodeHover,
    getActiveEffects,
}: CodeNodesProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { camera, raycaster, pointer } = useThree();

    const mapped = useMemo(() => mapNodesToBrain(data.nodes), [data.nodes]);

    const geometry = useMemo(() => new THREE.SphereGeometry(0.001, 8, 8), []);

    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();

        for (let i = 0; i < mapped.length; i++) {
            const m = mapped[i];
            dummy.position.copy(m.position);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);

            const isFile = m.node.type === 'file';
            color.set(isFile ? '#4a90d9' : '#c084fc');
            mesh.setColorAt(i, color);
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [mapped]);

    useFrame(() => {
        const mesh = meshRef.current;
        if (!mesh || !getActiveEffects) return;

        const activeEffects = getActiveEffects();
        if (activeEffects.size === 0) return;

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();
        let needsUpdate = false;

        for (let i = 0; i < mapped.length; i++) {
            const m = mapped[i];
            const effect = activeEffects.get(m.node.id);

            if (effect) {
                needsUpdate = true;
                const scale = 1 + effect.intensity * 3;
                dummy.position.copy(m.position);
                dummy.scale.setScalar(0.001 * scale);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);

                const glowColor = effect.type === 'pulse' ? '#ffffff' : '#7b5fff';
                const baseColor = m.node.type === 'file' ? '#4a90d9' : '#c084fc';
                color.set(baseColor).lerp(new THREE.Color(glowColor), effect.intensity * 0.7);
                mesh.setColorAt(i, color);
            }
        }

        if (needsUpdate) {
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
    });

    const handleClick = useCallback(
        (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            const mesh = meshRef.current;
            if (!mesh) return;

            raycaster.setFromCamera(pointer, camera);
            const hits = raycaster.intersectObject(mesh);
            if (hits.length > 0 && hits[0].instanceId !== undefined) {
                onNodeClick(mapped[hits[0].instanceId].node.id);
            }
        },
        [mapped, onNodeClick, raycaster, pointer, camera],
    );

    const handlePointerMove = useCallback(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObject(mesh);
        if (hits.length > 0 && hits[0].instanceId !== undefined) {
            const idx = hits[0].instanceId;
            const screenPos = hits[0].point.clone().project(camera);
            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
            const m = mapped[idx];
            onNodeHover(m.node.id, { x, y });
        } else {
            onNodeHover(null, null);
        }
    }, [mapped, onNodeHover, raycaster, pointer, camera]);

    if (mapped.length === 0) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, undefined!, mapped.length]}
            onClick={handleClick}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => onNodeHover(null, null)}
            frustumCulled={false}
        >
            <meshBasicMaterial
                attach="material"
                transparent
                opacity={0.8}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </instancedMesh>
    );
}

function Particles({ count = 1200, spread = 0.2 }: { count?: number; spread?: number }) {
    const pointsRef = useRef<THREE.Points>(null);

    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 0.01 + Math.random() * spread;
            pos[i3] = r * Math.sin(phi) * Math.cos(theta);
            pos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            pos[i3 + 2] = r * Math.cos(phi);
        }
        return pos;
    }, [count, spread]);

    useFrame(({ clock }) => {
        const pts = pointsRef.current;
        if (!pts) return;
        pts.rotation.y = clock.getElapsedTime() * 0.015;
        pts.rotation.x = Math.sin(clock.getElapsedTime() * 0.01) * 0.05;
    });

    const particleMaterial = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(180, 140, 255, 1)');
        gradient.addColorStop(0.3, 'rgba(140, 100, 200, 0.6)');
        gradient.addColorStop(1, 'rgba(100, 60, 160, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        const texture = new THREE.CanvasTexture(canvas);
        return new THREE.PointsMaterial({
            size: 0.0015,
            map: texture,
            transparent: true,
            opacity: 0.7,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
    }, []);

    return (
        <points ref={pointsRef} material={particleMaterial}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
        </points>
    );
}

const DEFAULT_CAM_Z = 0.2;

const SceneContent = forwardRef<
    BrainSceneHandle,
    BrainSceneProps & {
        onHover: (id: string | null, pos: { x: number; y: number } | null) => void;
    }
>(function SceneContent({ data, onNodeClick, selectedNodeId, onHover, getActiveEffects }, ref) {
    const { camera } = useThree();

    useImperativeHandle(ref, () => ({
        zoomIn: () => {
            camera.position.z = Math.max(0.08, camera.position.z * 0.85);
        },
        zoomOut: () => {
            camera.position.z = Math.min(0.4, camera.position.z * 1.15);
        },
        resetView: () => {
            camera.position.set(0, 0.01, DEFAULT_CAM_Z);
        },
    }));

    useFrame(({ pointer }) => {
        camera.position.x += (pointer.x * 0.015 - camera.position.x) * 0.03;
        camera.position.y += (-pointer.y * 0.015 + 0.01 - camera.position.y) * 0.03;
        camera.lookAt(0, 0, 0);
    });

    return (
        <>
            <color attach="background" args={['#050510']} />

            <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.05}
                enableZoom
                minDistance={0.08}
                maxDistance={0.4}
                enablePan={false}
            />

            <BrainTubes />
            <CodeNodes
                data={data}
                selectedId={selectedNodeId}
                onNodeClick={onNodeClick}
                onNodeHover={onHover}
                getActiveEffects={getActiveEffects}
            />
        </>
    );
});

class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
    state = { error: null as string | null };
    static getDerivedStateFromError(err: Error) {
        return { error: err.message };
    }
    render() {
        if (this.state.error) {
            return (
                <div className="flex h-full items-center justify-center bg-[#050510] text-red-400 text-sm p-4">
                    <div>
                        <div className="font-medium mb-1">Scene error</div>
                        <div className="text-text-muted text-xs">{this.state.error}</div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export const BrainScene = forwardRef<BrainSceneHandle, BrainSceneProps>(function BrainScene(
    { data, onNodeClick, selectedNodeId, getActiveEffects },
    ref,
) {
    const sceneRef = useRef<BrainSceneHandle>(null);
    const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);
    const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

    useImperativeHandle(ref, () => ({
        zoomIn: () => sceneRef.current?.zoomIn(),
        zoomOut: () => sceneRef.current?.zoomOut(),
        resetView: () => sceneRef.current?.resetView(),
    }));

    const nodeMap = useMemo(() => {
        const map = new Map<string, GraphNode>();
        for (const n of data.nodes) map.set(n.id, n);
        return map;
    }, [data.nodes]);

    const handleHover = useCallback(
        (id: string | null, pos: { x: number; y: number } | null) => {
            if (id) {
                const node = nodeMap.get(id);
                if (node) {
                    setHoveredNode({
                        id: node.id,
                        x: 0,
                        y: 0,
                        z: 0,
                        cluster: 0,
                        pagerank: 0,
                        centrality: 0,
                        type: node.type,
                        name: node.name,
                        filePath: node.filePath,
                    });
                }
                setHoverPos(pos);
            } else {
                setHoveredNode(null);
                setHoverPos(null);
            }
        },
        [nodeMap],
    );

    return (
        <SceneErrorBoundary>
            <div className="relative h-full w-full">
                <Canvas
                    camera={{ position: [0, 0.01, 0.2], fov: 75, near: 0.001, far: 10 }}
                    gl={{ antialias: true, alpha: true }}
                    dpr={[1, 1.5]}
                >
                    <Suspense fallback={null}>
                        <SceneContent
                            ref={sceneRef}
                            data={data}
                            onNodeClick={onNodeClick}
                            selectedNodeId={selectedNodeId}
                            onHover={handleHover}
                            getActiveEffects={getActiveEffects}
                        />
                    </Suspense>
                </Canvas>
                <NodeLabel node={hoveredNode} position={hoverPos} />
            </div>
        </SceneErrorBoundary>
    );
});
