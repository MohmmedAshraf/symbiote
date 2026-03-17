import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { LayoutNode } from '@/lib/types';
import { getClusterColor } from './brain-layout';

interface NeuronsProps {
    nodes: LayoutNode[];
    selectedId: string | null;
    connectedIds: Set<string>;
    onNodeClick: (id: string) => void;
    onNodeHover: (id: string | null, pos: { x: number; y: number } | null) => void;
}

const MAX_CLUSTERS = 20;
const frameObject3D = new THREE.Object3D();

export function Neurons({
    nodes,
    selectedId,
    connectedIds,
    onNodeClick,
    onNodeHover,
}: NeuronsProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { camera, raycaster, pointer } = useThree();

    const clusterColors = useMemo(() => {
        const colors: THREE.Color[] = [];
        for (let i = 0; i < MAX_CLUSTERS; i++) {
            colors.push(new THREE.Color(getClusterColor(i)));
        }
        return colors;
    }, []);

    const phases = useMemo(() => nodes.map(() => Math.random() * Math.PI * 2), [nodes]);

    const geometry = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);

    useEffect(() => {
        return () => {
            geometry.dispose();
        };
    }, [geometry]);

    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();

        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const size = 0.5 + n.pagerank * 6;
            dummy.position.set(n.x, n.y, n.z);
            dummy.scale.setScalar(size);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);

            color.copy(clusterColors[n.cluster % MAX_CLUSTERS]);
            mesh.setColorAt(i, color);
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [nodes, clusterColors]);

    useFrame(({ clock }) => {
        const mesh = meshRef.current;
        if (!mesh) return;

        const time = clock.getElapsedTime();
        const dummy = frameObject3D;

        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const baseSize = 0.5 + n.pagerank * 6;
            const pulse = 1.0 + Math.sin(time * 1.5 + phases[i]) * 0.08;
            let scale = baseSize * pulse;

            if (selectedId) {
                if (n.id === selectedId) {
                    scale *= 1.5;
                } else if (connectedIds.has(n.id)) {
                    scale *= 1.1;
                } else {
                    scale *= 0.5;
                }
            }

            dummy.position.set(n.x, n.y, n.z);
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    const handleClick = useCallback(
        (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            const mesh = meshRef.current;
            if (!mesh) return;

            raycaster.setFromCamera(pointer, camera);
            const hits = raycaster.intersectObject(mesh);
            if (hits.length > 0 && hits[0].instanceId !== undefined) {
                onNodeClick(nodes[hits[0].instanceId].id);
            }
        },
        [nodes, onNodeClick, raycaster, pointer, camera],
    );

    const handlePointerLeave = useCallback(() => {
        onNodeHover(null, null);
    }, [onNodeHover]);

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
            onNodeHover(nodes[idx].id, { x, y });
        } else {
            onNodeHover(null, null);
        }
    }, [nodes, onNodeHover, raycaster, pointer, camera]);

    if (nodes.length === 0) return null;

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, undefined as unknown as THREE.Material, nodes.length]}
            onClick={handleClick}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            frustumCulled={false}
        >
            <meshBasicMaterial attach="material" transparent opacity={0.9} />
        </instancedMesh>
    );
}
