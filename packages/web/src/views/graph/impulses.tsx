import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { LayoutEdge } from '@/lib/types';
import { getClusterColor } from './brain-layout';

interface ImpulsesProps {
    edges: LayoutEdge[];
    curves: THREE.CatmullRomCurve3[];
    nodeClusterMap: Map<string, number>;
    selectedId: string | null;
    triggeredEdgeIndices?: Set<number>;
}

interface ImpulseState {
    t: number;
    speed: number;
    active: boolean;
    cooldown: number;
    color: THREE.Color;
}

const MAX_ACTIVE_RATIO = 0.3;
const OFFSCREEN = new THREE.Vector3(99999, 99999, 99999);

export function Impulses({
    edges,
    curves,
    nodeClusterMap,
    selectedId,
    triggeredEdgeIndices,
}: ImpulsesProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    const states = useMemo(() => {
        return edges.map((edge): ImpulseState => {
            const isCall = edge.type === 'calls';
            const cluster = nodeClusterMap.get(edge.sourceId) ?? 0;
            return {
                t: 0,
                speed: isCall ? 0.4 + Math.random() * 0.3 : 0.15 + Math.random() * 0.2,
                active: false,
                cooldown: Math.random() * 5,
                color: new THREE.Color(getClusterColor(cluster)),
            };
        });
    }, [edges, nodeClusterMap]);

    const geometry = useMemo(() => new THREE.SphereGeometry(0.6, 6, 6), []);
    const material = useMemo(
        () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }),
        [],
    );

    useFrame((_, delta) => {
        const mesh = meshRef.current;
        if (!mesh || edges.length === 0) return;

        const maxActive = Math.floor(edges.length * MAX_ACTIVE_RATIO);
        let activeCount = 0;
        const dummy = new THREE.Object3D();
        const tempColor = new THREE.Color();

        for (let i = 0; i < states.length; i++) {
            if (states[i].active) activeCount++;
        }

        for (let i = 0; i < states.length; i++) {
            const state = states[i];

            if (triggeredEdgeIndices?.has(i) && !state.active) {
                state.active = true;
                state.t = 0;
                state.speed = 0.6 + Math.random() * 0.2;
            }

            if (!state.active) {
                state.cooldown -= delta;
                if (state.cooldown <= 0 && activeCount < maxActive) {
                    state.active = true;
                    state.t = 0;
                    activeCount++;
                }
            }

            if (state.active) {
                state.t += state.speed * delta;

                if (state.t >= 1) {
                    state.active = false;
                    state.cooldown = 1 + Math.random() * 4;
                    dummy.position.copy(OFFSCREEN);
                    dummy.scale.setScalar(0);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(i, dummy.matrix);
                    continue;
                }

                const curve = curves[i];
                const point = curve.getPointAt(state.t);
                const brightness = Math.sin(state.t * Math.PI);
                const scale = 0.5 + brightness * 0.5;

                dummy.position.copy(point);
                dummy.scale.setScalar(scale);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);

                tempColor.copy(state.color).multiplyScalar(0.3 + brightness * 0.7);
                mesh.setColorAt(i, tempColor);
            } else {
                dummy.position.copy(OFFSCREEN);
                dummy.scale.setScalar(0);
                dummy.updateMatrix();
                mesh.setMatrixAt(i, dummy.matrix);
            }
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    if (edges.length === 0) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, material, edges.length]}
            frustumCulled={false}
        />
    );
}
