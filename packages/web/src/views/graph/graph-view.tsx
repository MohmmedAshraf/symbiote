import { Suspense, lazy, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import type { GraphData, NodeContext } from '@/lib/types';
import type { BrainSceneHandle } from './brain-scene';
import { NodeSidebar } from './node-sidebar';
import { GraphControls } from './graph-controls';
import { StatusBar } from './status-bar';
import { useEvents } from '@/lib/events-context';
import { useNodeEffects } from './event-effects';

const BrainScene = lazy(() =>
    import('./brain-scene').then((m) => ({
        default: m.BrainScene,
    })),
);

export function GraphView() {
    const sceneRef = useRef<BrainSceneHandle>(null);
    const [graphData, setGraphData] = useState<GraphData | null>(null);
    const { lastEvent, connectionState, eventCount } = useEvents();
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

    const fileNodeMap = useMemo(() => {
        if (!graphData) return new Map<string, string>();
        const map = new Map<string, string>();
        for (const node of graphData.nodes) {
            if (node.filePath) {
                map.set(node.filePath, node.id);
                const shortPath = node.filePath.replace(/^.*?\//, '');
                if (!map.has(shortPath)) map.set(shortPath, node.id);
            }
        }
        return map;
    }, [graphData]);

    const fileToNodeId = useCallback(
        (filePath: string) => {
            return fileNodeMap.get(filePath) ?? null;
        },
        [fileNodeMap],
    );

    const { processEvent, getActiveEffects } = useNodeEffects(fileToNodeId);

    useEffect(() => {
        if (lastEvent) processEvent(lastEvent);
    }, [lastEvent, processEvent]);

    const lastReadFile = useRef<string | null>(null);
    const [triggeredEdgeIndices, setTriggeredEdgeIndices] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (!lastEvent || !graphData) return;

        if (lastEvent.type === 'file:read' && lastEvent.data.filePath) {
            lastReadFile.current = lastEvent.data.filePath;
            return;
        }

        if (lastEvent.type === 'file:edit' && lastEvent.data.filePath && lastReadFile.current) {
            const readFile = lastReadFile.current;
            const editFile = lastEvent.data.filePath;
            lastReadFile.current = null;

            const edgeIndex = graphData.edges.findIndex(
                (e) =>
                    (e.sourceId.includes(readFile) && e.targetId.includes(editFile)) ||
                    (e.targetId.includes(readFile) && e.sourceId.includes(editFile)),
            );

            if (edgeIndex >= 0) {
                setTriggeredEdgeIndices(new Set([edgeIndex]));
                setTimeout(() => setTriggeredEdgeIndices(new Set()), 500);
            }
        }
    }, [lastEvent, graphData]);

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
                        getActiveEffects={getActiveEffects}
                    />
                </Suspense>
            )}

            <GraphControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onResetView={handleResetView}
            />

            <StatusBar
                connectionState={connectionState}
                lastEvent={lastEvent}
                eventCount={eventCount}
            />

            {selectedNode && (
                <NodeSidebar context={selectedNode} onClose={() => setSelectedNode(null)} />
            )}
        </div>
    );
}
