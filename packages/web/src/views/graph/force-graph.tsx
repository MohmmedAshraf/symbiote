import { useCallback, useMemo, useRef, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { GraphData } from '@/lib/types';
import * as THREE from 'three';

const NODE_COLORS: Record<string, string> = {
    file: '#5b8dea',
    function: '#34d399',
    class: '#c084fc',
    method: '#a78bfa',
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
    const highlightSet = useMemo(
        () => new Set(highlightedNodes),
        [highlightedNodes],
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
                        ? 8
                        : n.type === 'class'
                            ? 6
                            : n.type === 'method'
                                ? 3
                                : 4,
            })),
            links: data.edges.map((e) => ({
                source: e.sourceId,
                target: e.targetId,
                type: e.type,
            })),
        }),
        [data],
    );

    const handleClick = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (node: any) => {
            if (node?.id) onNodeClick(String(node.id));
        },
        [onNodeClick],
    );

    const nodeThreeObject = useCallback(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (node: any) => {
            const nodeVal = node.val ?? 4;
            const size = Math.cbrt(nodeVal) * 2.5;
            const isHighlighted = highlightSet.has(node.id);
            const color = isHighlighted ? '#fbbf24' : (node.color ?? '#94a3b8');

            const geometry = new THREE.SphereGeometry(size, 16, 16);
            const material = new THREE.MeshPhongMaterial({
                color,
                transparent: true,
                opacity: 0.85,
                shininess: 80,
                emissive: new THREE.Color(color),
                emissiveIntensity: isHighlighted ? 0.4 : 0.15,
            });
            return new THREE.Mesh(geometry, material);
        },
        [highlightSet],
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null);

    useEffect(() => {
        const fg = fgRef.current;
        if (!fg) return;

        fg.d3Force('charge')?.strength(-250);
        fg.d3Force('link')?.distance(60);
        fg.d3Force('center')?.strength(0.03);
    }, [graphData]);

    return (
        <div className="h-full w-full">
            <ForceGraph3D
                ref={fgRef}
                graphData={graphData}
                nodeLabel="name"
                nodeThreeObject={nodeThreeObject}
                nodeThreeObjectExtend={false}
                linkColor={() => 'rgba(100, 130, 180, 0.15)'}
                linkWidth={0.4}
                linkDirectionalArrowLength={3}
                linkDirectionalArrowRelPos={1}
                linkDirectionalParticles={1}
                linkDirectionalParticleWidth={1.5}
                linkDirectionalParticleSpeed={0.004}
                onNodeClick={handleClick}
                warmupTicks={120}
                cooldownTime={5000}
                backgroundColor="#0a0a0a"
                showNavInfo={false}
            />
        </div>
    );
}
