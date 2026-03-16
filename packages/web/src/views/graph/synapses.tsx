import { useMemo } from 'react';
import * as THREE from 'three';
import type { LayoutEdge } from '@/lib/types';
import { getClusterColor } from './brain-layout';

interface SynapsesProps {
    edges: LayoutEdge[];
    curves: THREE.CatmullRomCurve3[];
    nodeClusterMap: Map<string, number>;
    selectedId: string | null;
    connectedIds: Set<string>;
}

const TUBE_SEGMENTS = 16;
const RADIUS_SEGMENTS = 4;

function buildTaperedTube(curve: THREE.CatmullRomCurve3, maxRadius: number): THREE.BufferGeometry {
    const frames = curve.computeFrenetFrames(TUBE_SEGMENTS, false);
    const points = curve.getPoints(TUBE_SEGMENTS);

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= TUBE_SEGMENTS; i++) {
        const t = i / TUBE_SEGMENTS;
        const radius = maxRadius * Math.sin(t * Math.PI);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        const P = points[i];

        for (let j = 0; j <= RADIUS_SEGMENTS; j++) {
            const angle = (j / RADIUS_SEGMENTS) * Math.PI * 2;
            const sin = Math.sin(angle);
            const cos = Math.cos(angle);

            const x = P.x + radius * (cos * N.x + sin * B.x);
            const y = P.y + radius * (cos * N.y + sin * B.y);
            const z = P.z + radius * (cos * N.z + sin * B.z);
            vertices.push(x, y, z);
        }
    }

    for (let i = 0; i < TUBE_SEGMENTS; i++) {
        for (let j = 0; j < RADIUS_SEGMENTS; j++) {
            const a = i * (RADIUS_SEGMENTS + 1) + j;
            const b = a + RADIUS_SEGMENTS + 1;
            const c = a + 1;
            const d = b + 1;
            indices.push(a, b, c);
            indices.push(c, b, d);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    return geo;
}

export function Synapses({
    edges,
    curves,
    nodeClusterMap,
    selectedId,
    connectedIds,
}: SynapsesProps) {
    const tubes = useMemo(() => {
        return edges.map((edge, i) => {
            const curve = curves[i];
            const isCall = edge.type === 'calls';
            const radius = isCall ? 0.25 : 0.12;
            const baseOpacity = isCall ? 0.45 : 0.25;

            const dimmed =
                selectedId !== null &&
                !connectedIds.has(edge.sourceId) &&
                !connectedIds.has(edge.targetId) &&
                edge.sourceId !== selectedId &&
                edge.targetId !== selectedId;

            const opacity = dimmed ? baseOpacity * 0.1 : baseOpacity;

            const sourceCluster = nodeClusterMap.get(edge.sourceId) ?? 0;
            const color = getClusterColor(sourceCluster);

            const geometry = buildTaperedTube(curve, radius);

            return { geometry, color, opacity, key: `${edge.sourceId}-${edge.targetId}-${i}` };
        });
    }, [edges, curves, nodeClusterMap, selectedId, connectedIds]);

    return (
        <group>
            {tubes.map((tube) => (
                <mesh key={tube.key} geometry={tube.geometry}>
                    <meshBasicMaterial
                        color={tube.color}
                        transparent
                        opacity={tube.opacity}
                        depthWrite={false}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            ))}
        </group>
    );
}
