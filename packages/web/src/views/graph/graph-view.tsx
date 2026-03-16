import { Suspense, lazy, useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { GraphData, NodeContext } from '@/lib/types';
import { NodeSidebar } from './node-sidebar';

const ForceGraph = lazy(() =>
    import('./force-graph').then((m) => ({
        default: m.ForceGraph,
    }))
);

export function GraphView() {
    const [graphData, setGraphData] = useState<GraphData | null>(
        null
    );
    const [selectedNode, setSelectedNode] =
        useState<NodeContext | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.graph
            .getData()
            .then(setGraphData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    async function handleNodeClick(nodeId: string) {
        try {
            const context =
                await api.graph.getNodeContext(nodeId);
            setSelectedNode(context);
        } catch {
            setSelectedNode(null);
        }
    }

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-sm text-text-muted">
                    Loading graph...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-sm text-danger">
                    Failed to load graph: {error}
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full">
            {graphData && (
                <Suspense
                    fallback={
                        <div className="flex h-full items-center justify-center">
                            <div className="text-sm text-text-muted">
                                Loading 3D engine...
                            </div>
                        </div>
                    }
                >
                    <ForceGraph
                        data={graphData}
                        onNodeClick={handleNodeClick}
                        highlightedNodes={
                            selectedNode
                                ? [selectedNode.node.id]
                                : []
                        }
                    />
                </Suspense>
            )}

            {selectedNode && (
                <NodeSidebar
                    context={selectedNode}
                    onClose={() => setSelectedNode(null)}
                />
            )}
        </div>
    );
}
