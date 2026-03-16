import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { LayoutNode } from '@/lib/types';
import { getClusterColor } from './brain-layout';
import neuronVert from './shaders/neuron.vert';
import neuronFrag from './shaders/neuron.frag';

interface NeuronsProps {
    nodes: LayoutNode[];
    selectedId: string | null;
    connectedIds: Set<string>;
    onNodeClick: (id: string) => void;
    onNodeHover: (id: string | null, pos: { x: number; y: number } | null) => void;
}

const MAX_CLUSTERS = 20;

export function Neurons({
    nodes,
    selectedId,
    connectedIds,
    onNodeClick,
    onNodeHover,
}: NeuronsProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const firingRef = useRef<Float32Array>(new Float32Array(0));
    const { camera, size, raycaster } = useThree();

    const geometry = useMemo(() => new THREE.SphereGeometry(1, 12, 12), []);

    const { clusterAttr, pagerankAttr, centralityAttr, phaseAttr, firingAttr } = useMemo(() => {
        const count = nodes.length;
        const cluster = new Float32Array(count);
        const pagerank = new Float32Array(count);
        const centrality = new Float32Array(count);
        const phase = new Float32Array(count);
        const firing = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            cluster[i] = nodes[i].cluster;
            pagerank[i] = nodes[i].pagerank;
            centrality[i] = nodes[i].centrality;
            phase[i] = Math.random();
            firing[i] = 0;
        }

        firingRef.current = firing;

        return {
            clusterAttr: new THREE.InstancedBufferAttribute(cluster, 1),
            pagerankAttr: new THREE.InstancedBufferAttribute(pagerank, 1),
            centralityAttr: new THREE.InstancedBufferAttribute(centrality, 1),
            phaseAttr: new THREE.InstancedBufferAttribute(phase, 1),
            firingAttr: new THREE.InstancedBufferAttribute(firing, 1),
        };
    }, [nodes]);

    const material = useMemo(() => {
        const clusterColors: THREE.Vector3[] = [];
        for (let i = 0; i < MAX_CLUSTERS; i++) {
            const c = new THREE.Color(getClusterColor(i));
            clusterColors.push(new THREE.Vector3(c.r, c.g, c.b));
        }

        return new THREE.ShaderMaterial({
            vertexShader: neuronVert,
            fragmentShader: neuronFrag,
            uniforms: {
                uTime: { value: 0 },
                uClusterColors: { value: clusterColors },
                uDimAmount: { value: 0 },
                uSelectedIndex: { value: -1 },
            },
            transparent: true,
        });
    }, []);

    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;

        const dummy = new THREE.Object3D();
        for (let i = 0; i < nodes.length; i++) {
            dummy.position.set(nodes[i].x, nodes[i].y, nodes[i].z);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    }, [nodes]);

    useEffect(() => {
        const geo = meshRef.current?.geometry;
        if (!geo) return;

        geo.setAttribute('aCluster', clusterAttr);
        geo.setAttribute('aPagerank', pagerankAttr);
        geo.setAttribute('aCentrality', centralityAttr);
        geo.setAttribute('aPhase', phaseAttr);
        geo.setAttribute('aFiring', firingAttr);
    }, [clusterAttr, pagerankAttr, centralityAttr, phaseAttr, firingAttr]);

    useFrame((_, delta) => {
        material.uniforms.uTime.value += delta;

        if (selectedId) {
            const idx = nodes.findIndex((n) => n.id === selectedId);
            material.uniforms.uSelectedIndex.value = idx;
            material.uniforms.uDimAmount.value = Math.min(
                material.uniforms.uDimAmount.value + delta * 3,
                1,
            );
        } else {
            material.uniforms.uSelectedIndex.value = -1;
            material.uniforms.uDimAmount.value = Math.max(
                material.uniforms.uDimAmount.value - delta * 3,
                0,
            );
        }

        const firing = firingRef.current;
        let needsUpdate = false;
        for (let i = 0; i < firing.length; i++) {
            if (firing[i] > 0) {
                firing[i] = Math.max(0, firing[i] - delta * 2);
                needsUpdate = true;
            }
        }
        if (needsUpdate) {
            firingAttr.needsUpdate = true;
        }
    });

    const handleClick = useCallback(
        (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            const mesh = meshRef.current;
            if (!mesh) return;

            const intersects = raycaster.intersectObject(mesh);
            if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
                const id = intersects[0].instanceId;
                firingRef.current[id] = 1;
                firingAttr.needsUpdate = true;
                onNodeClick(nodes[id].id);
            }
        },
        [nodes, onNodeClick, raycaster, firingAttr],
    );

    const handlePointerMove = useCallback(
        (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            const mesh = meshRef.current;
            if (!mesh) return;

            const intersects = raycaster.intersectObject(mesh);
            if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
                const id = intersects[0].instanceId;
                const point = intersects[0].point;
                const projected = point.clone().project(camera);
                const x = (projected.x * 0.5 + 0.5) * size.width;
                const y = (-projected.y * 0.5 + 0.5) * size.height;
                onNodeHover(nodes[id].id, { x, y });
            } else {
                onNodeHover(null, null);
            }
        },
        [nodes, onNodeHover, raycaster, camera, size],
    );

    const handlePointerLeave = useCallback(() => {
        onNodeHover(null, null);
    }, [onNodeHover]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, material, nodes.length]}
            frustumCulled={false}
            onClick={handleClick}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
        />
    );
}
