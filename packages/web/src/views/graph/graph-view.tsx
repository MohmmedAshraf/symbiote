import { Suspense, lazy, useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { GraphData, NodeContext } from '@/lib/types';
import { NodeSidebar } from './node-sidebar';
import { GraphControls } from './graph-controls';

const BrainScene = lazy(() =>
    import('./brain-scene').then((m) => ({
        default: m.BrainScene,
    })),
);

export function GraphView() {
    const [graphData, setGraphData] = useState<GraphData | null>(null);
    const [selectedNode, setSelectedNode] = useState<NodeContext | null>(null);
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
            const context = await api.graph.getNodeContext(nodeId);
            setSelectedNode(context);
        } catch {
            setSelectedNode(null);
        }
    }

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-sm text-text-muted">Loading graph...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-sm text-danger">Failed to load graph: {error}</div>
            </div>
        );
    }

    return (
        <div className="relative h-full">
            {graphData && (
                <Suspense
                    fallback={
                        <div className="flex h-full items-center justify-center bg-[#050508]">
                            <div className="text-sm text-text-muted">
                                Initializing neural network...
                            </div>
                        </div>
                    }
                >
                    <BrainScene
                        data={graphData}
                        onNodeClick={handleNodeClick}
                        selectedNodeId={selectedNode?.node.id ?? null}
                    />
                </Suspense>
            )}

            <GraphControls />

            {selectedNode && (
                <NodeSidebar context={selectedNode} onClose={() => setSelectedNode(null)} />
            )}
        </div>
    );
}
