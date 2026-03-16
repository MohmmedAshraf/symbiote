import { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import type { GraphData, NodeContext } from '@/lib/types';
import type { BrainSceneHandle } from './brain-scene';
import { NodeSidebar } from './node-sidebar';
import { GraphControls } from './graph-controls';

const BrainScene = lazy(() =>
    import('./brain-scene').then((m) => ({
        default: m.BrainScene,
    })),
);

export function GraphView() {
    const sceneRef = useRef<BrainSceneHandle>(null);
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

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            switch (e.key) {
                case '+':
                case '=':
                    sceneRef.current?.zoomIn();
                    break;
                case '-':
                case '_':
                    sceneRef.current?.zoomOut();
                    break;
                case '0':
                    sceneRef.current?.resetView();
                    break;
                case 'Escape':
                    setSelectedNode(null);
                    break;
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleZoomIn = useCallback(() => sceneRef.current?.zoomIn(), []);
    const handleZoomOut = useCallback(() => sceneRef.current?.zoomOut(), []);
    const handleResetView = useCallback(() => sceneRef.current?.resetView(), []);

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
                        <div className="flex h-full items-center justify-center bg-[#050510]">
                            <div className="text-sm text-text-muted">
                                Initializing neural network...
                            </div>
                        </div>
                    }
                >
                    <BrainScene
                        ref={sceneRef}
                        data={graphData}
                        onNodeClick={handleNodeClick}
                        selectedNodeId={selectedNode?.node.id ?? null}
                    />
                </Suspense>
            )}

            <GraphControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onResetView={handleResetView}
                nodeCount={graphData?.nodes.length}
                edgeCount={graphData?.edges.length}
            />

            {selectedNode && (
                <NodeSidebar context={selectedNode} onClose={() => setSelectedNode(null)} />
            )}
        </div>
    );
}
