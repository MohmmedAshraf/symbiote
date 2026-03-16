import { useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ForceGraph3D from 'three-forcegraph';
import * as THREE from 'three';
import type { GraphData } from '@/lib/types';
import { GraphControls } from './graph-controls';

const NODE_COLORS: Record<string, string> = {
    file: '#5b8dea',
    function: '#34d399',
    class: '#c084fc',
    interface: '#f59e0b',
    variable: '#94a3b8',
};

const VIOLATION_COLOR = '#ef4444';

interface ForceGraphProps {
    data: GraphData;
    onNodeClick: (nodeId: string) => void;
    highlightedNodes: string[];
}

export function ForceGraph({
    data,
    onNodeClick,
    highlightedNodes,
}: ForceGraphProps) {
    return (
        <div className="h-full w-full">
            <Canvas camera={{ position: [0, 0, 300], fov: 60 }}>
                <ambientLight intensity={0.6} />
                <pointLight
                    position={[200, 200, 200]}
                    intensity={0.8}
                />
                <ForceGraphScene
                    data={data}
                    onNodeClick={onNodeClick}
                    highlightedNodes={highlightedNodes}
                />
                <OrbitControls
                    enableDamping
                    dampingFactor={0.1}
                />
            </Canvas>
            <GraphControls />
        </div>
    );
}

function ForceGraphScene({
    data,
    onNodeClick,
    highlightedNodes,
}: ForceGraphProps) {
    const graphRef = useRef<ForceGraph3D | null>(null);
    const groupRef = useRef<THREE.Group>(null);

    const highlightSet = useMemo(
        () => new Set(highlightedNodes),
        [highlightedNodes]
    );

    const graphData = useMemo(
        () => ({
            nodes: data.nodes.map((n) => ({
                id: n.id,
                name: n.name,
                type: n.type,
                filePath: n.filePath,
                color: n.metadata?.violation
                    ? VIOLATION_COLOR
                    : (NODE_COLORS[n.type] ?? '#94a3b8'),
                val:
                    n.type === 'file'
                        ? 3
                        : n.type === 'class'
                          ? 2
                          : 1,
            })),
            links: data.edges.map((e) => ({
                source: e.sourceId,
                target: e.targetId,
                type: e.type,
            })),
        }),
        [data]
    );

    const handleClick = useCallback(
        (node: { id?: string }) => {
            if (node.id) onNodeClick(node.id as string);
        },
        [onNodeClick]
    );

    useEffect(() => {
        if (!groupRef.current) return;

        const graph = new ForceGraph3D()
            .graphData(graphData)
            .nodeLabel('name')
            .nodeColor(
                (node: { color?: string }) =>
                    node.color ?? '#94a3b8'
            )
            .nodeVal(
                (node: { val?: number }) => node.val ?? 1
            )
            .nodeOpacity(0.9)
            .linkColor(() => 'rgba(148, 163, 184, 0.15)')
            .linkWidth(0.3)
            .linkDirectionalArrowLength(2)
            .linkDirectionalArrowRelPos(1)
            .onNodeClick(handleClick)
            .warmupTicks(80)
            .cooldownTime(3000);

        graphRef.current = graph;
        groupRef.current.add(graph);

        return () => {
            if (groupRef.current && graph) {
                groupRef.current.remove(graph);
            }
        };
    }, [graphData, handleClick]);

    useEffect(() => {
        if (!graphRef.current) return;

        graphRef.current.nodeColor(
            (node: { id?: string; color?: string }) => {
                if (highlightSet.has(node.id ?? ''))
                    return '#fbbf24';
                return node.color ?? '#94a3b8';
            }
        );
    }, [highlightSet]);

    useFrame(() => {
        graphRef.current?.tickFrame();
    });

    return <group ref={groupRef} />;
}
