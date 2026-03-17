import { createRequire } from 'node:module';
import { CortexRepository } from './repository.js';
import type { StageResult, StageError } from './types.js';
import type { ExecutionFlow, LayerAssignment, LayerKind } from './topology-types.js';
import { Graph } from '#core/types.js';
import type { GraphInstance } from '#core/types.js';

const req = createRequire(import.meta.url);
const louvain = req('graphology-communities-louvain');
const centrality = req('graphology-metrics/centrality');

const STRUCTURAL_EDGE_TYPES = new Set(['calls', 'flows_to', 'implements']);

const LAYER_KEYWORDS: Record<LayerKind, string[]> = {
    controller: ['controller', 'handler', 'route', 'endpoint', 'middleware'],
    service: ['service', 'usecase', 'manager', 'provider'],
    repository: ['repository', 'repo', 'store', 'dao', 'gateway'],
    database: ['db', 'database', 'connection', 'pool', 'migration', 'schema'],
    utility: ['util', 'helper', 'common', 'shared', 'lib'],
    unknown: [],
};

export async function loadGraphFromDb(repo: CortexRepository): Promise<GraphInstance> {
    const graph = new Graph({ multi: true, type: 'directed' });

    const functions = await repo.getAllFunctions();
    const classes = await repo.getAllClasses();
    const methods = await repo.getAllMethods();

    for (const fn of functions) {
        graph.addNode(fn.id, {
            type: 'function',
            name: fn.name,
            filePath: fn.filePath,
            isEntryPoint: fn.isEntryPoint,
            entryPointScore: fn.entryPointScore,
            isAsync: fn.isAsync,
            lineStart: fn.lineStart,
            lineEnd: fn.lineEnd,
        });
    }

    for (const cls of classes) {
        graph.addNode(cls.id, {
            type: 'class',
            name: cls.name,
            filePath: cls.filePath,
            isEntryPoint: false,
            entryPointScore: 0,
            isAsync: false,
            lineStart: cls.lineStart,
            lineEnd: cls.lineEnd,
        });
    }

    for (const m of methods) {
        graph.addNode(m.id, {
            type: 'method',
            name: m.name,
            filePath: m.filePath,
            isEntryPoint: false,
            entryPointScore: 0,
            isAsync: m.isAsync,
            lineStart: m.lineStart,
            lineEnd: m.lineEnd,
        });
    }

    const allNodeIds = new Set<string>();
    graph.forEachNode((id: string) => allNodeIds.add(id));

    for (const fn of functions) {
        const calls = await repo.getCallsFrom(fn.id);
        for (const call of calls) {
            if (
                call.sourceId !== call.targetId &&
                allNodeIds.has(call.sourceId) &&
                allNodeIds.has(call.targetId)
            ) {
                graph.addEdge(call.sourceId, call.targetId, {
                    type: 'calls',
                    isAsync: call.isAsync,
                });
            }
        }

        const flowsTo = await repo.getFlowsFrom(fn.id);
        for (const flow of flowsTo) {
            if (
                flow.sourceId !== flow.targetId &&
                allNodeIds.has(flow.sourceId) &&
                allNodeIds.has(flow.targetId)
            ) {
                graph.addEdge(flow.sourceId, flow.targetId, { type: 'flows_to' });
            }
        }
    }

    for (const m of methods) {
        const calls = await repo.getCallsFrom(m.id);
        for (const call of calls) {
            if (
                call.sourceId !== call.targetId &&
                allNodeIds.has(call.sourceId) &&
                allNodeIds.has(call.targetId)
            ) {
                graph.addEdge(call.sourceId, call.targetId, {
                    type: 'calls',
                    isAsync: call.isAsync,
                });
            }
        }

        const flowsTo = await repo.getFlowsFrom(m.id);
        for (const flow of flowsTo) {
            if (
                flow.sourceId !== flow.targetId &&
                allNodeIds.has(flow.sourceId) &&
                allNodeIds.has(flow.targetId)
            ) {
                graph.addEdge(flow.sourceId, flow.targetId, { type: 'flows_to' });
            }
        }
    }

    for (const cls of classes) {
        const impls = await repo.getImplementsFrom(cls.id);
        for (const impl of impls) {
            if (
                impl.sourceId !== impl.targetId &&
                allNodeIds.has(impl.sourceId) &&
                allNodeIds.has(impl.targetId)
            ) {
                graph.addEdge(impl.sourceId, impl.targetId, { type: 'implements' });
            }
        }
    }

    return graph;
}

export function runCommunityDetection(graph: GraphInstance): Record<string, number> {
    if (graph.order === 0) return {};

    const undirected = new Graph({ multi: false, type: 'undirected' });
    graph.forEachNode((node: string, attrs: Record<string, unknown>) => {
        undirected.addNode(node, attrs);
    });
    graph.forEachEdge(
        (_edge: string, attrs: Record<string, unknown>, source: string, target: string) => {
            const type = attrs.type as string;
            if (STRUCTURAL_EDGE_TYPES.has(type)) {
                if (source !== target && !undirected.hasEdge(source, target)) {
                    undirected.addEdge(source, target);
                }
            }
        },
    );

    if (undirected.size === 0) {
        const result: Record<string, number> = {};
        undirected.forEachNode((id: string) => {
            result[id] = 0;
        });
        return result;
    }

    return louvain(undirected);
}

export function runPageRank(graph: GraphInstance): Record<string, number> {
    if (graph.order === 0) return {};
    return centrality.pagerank(graph);
}

export function runBetweenness(graph: GraphInstance): Record<string, number> {
    if (graph.order === 0) return {};
    return centrality.betweenness(graph);
}

export function traceExecutionFlows(
    graph: GraphInstance,
    _repo: CortexRepository,
): ExecutionFlow[] {
    const entryPoints: Array<{ id: string; score: number }> = [];
    graph.forEachNode((id: string, attrs: Record<string, unknown>) => {
        const isEntryPoint = attrs.isEntryPoint as boolean;
        const score = (attrs.entryPointScore as number) ?? 0;
        if (isEntryPoint || score > 0.5) {
            entryPoints.push({ id, score });
        }
    });

    entryPoints.sort((a, b) => b.score - a.score);

    const flows: ExecutionFlow[] = [];
    const MAX_DEPTH = 50;

    for (const entry of entryPoints) {
        const visited = new Set<string>();
        const nodeIds: string[] = [];
        let hasAsync = false;
        let hasErrorPath = false;

        const queue: Array<{ id: string; depth: number }> = [{ id: entry.id, depth: 0 }];
        visited.add(entry.id);

        while (queue.length > 0) {
            const current = queue.shift()!;
            nodeIds.push(current.id);

            if (current.depth >= MAX_DEPTH) continue;

            const attrs = graph.getNodeAttributes(current.id);
            if (attrs.isAsync) hasAsync = true;

            graph.forEachOutEdge(
                current.id,
                (_edge: string, edgeAttrs: Record<string, unknown>, _src: string, tgt: string) => {
                    const type = edgeAttrs.type as string;
                    if (type === 'calls' || type === 'flows_to') {
                        if (edgeAttrs.isAsync) hasAsync = true;
                        if (!visited.has(tgt)) {
                            visited.add(tgt);
                            queue.push({ id: tgt, depth: current.depth + 1 });
                        }
                    }
                },
            );
        }

        if (nodeIds.length > 0) {
            const name = entry.id.split(':').pop() ?? entry.id;
            flows.push({
                id: `flow:${name}`,
                name,
                entryPointId: entry.id,
                nodeIds,
                hasAsync,
                hasErrorPath,
            });
        }
    }

    return flows;
}

export function detectLayers(
    graph: GraphInstance,
    communities: Record<string, number>,
): LayerAssignment[] {
    const assignments: LayerAssignment[] = [];

    graph.forEachNode((id: string, attrs: Record<string, unknown>) => {
        const name = ((attrs.name as string) ?? '').toLowerCase();
        const filePath = ((attrs.filePath as string) ?? '').toLowerCase();

        let bestLayer: LayerKind = 'unknown';
        let bestScore = 0;

        for (const [layer, keywords] of Object.entries(LAYER_KEYWORDS)) {
            if (layer === 'unknown') continue;
            for (const keyword of keywords) {
                if (name.includes(keyword) || filePath.includes(keyword)) {
                    const score = keyword.length / Math.max(name.length, 1);
                    if (score > bestScore) {
                        bestScore = score;
                        bestLayer = layer as LayerKind;
                    }
                }
            }
        }

        if (bestLayer === 'unknown') {
            const outEdges = graph.outEdges(id);
            const inEdges = graph.inEdges(id);
            const outDegree = outEdges.length;
            const inDegree = inEdges.length;

            if (outDegree > 0 && inDegree === 0) {
                bestLayer = 'controller';
                bestScore = 0.3;
            } else if (inDegree > 0 && outDegree === 0) {
                bestLayer = 'database';
                bestScore = 0.3;
            } else if (outDegree > 0 && inDegree > 0) {
                bestLayer = 'service';
                bestScore = 0.2;
            }
        }

        const confidence = Math.min(1.0, bestScore + 0.3);
        assignments.push({ nodeId: id, layer: bestLayer, confidence });
    });

    const communityLayers = new Map<number, Map<LayerKind, number>>();
    for (const assignment of assignments) {
        const community = communities[assignment.nodeId];
        if (community === undefined) continue;
        if (!communityLayers.has(community)) {
            communityLayers.set(community, new Map());
        }
        const counts = communityLayers.get(community)!;
        counts.set(assignment.layer, (counts.get(assignment.layer) ?? 0) + 1);
    }

    for (const assignment of assignments) {
        if (assignment.layer !== 'unknown') continue;
        const community = communities[assignment.nodeId];
        if (community === undefined) continue;
        const counts = communityLayers.get(community);
        if (!counts) continue;

        let dominantLayer: LayerKind = 'unknown';
        let maxCount = 0;
        for (const [layer, count] of counts) {
            if (layer !== 'unknown' && count > maxCount) {
                maxCount = count;
                dominantLayer = layer;
            }
        }
        if (dominantLayer !== 'unknown') {
            assignment.layer = dominantLayer;
            assignment.confidence = Math.min(1.0, assignment.confidence + 0.1);
        }
    }

    return assignments;
}

export async function runStage6(
    repo: CortexRepository,
    _rootDir: string,
    options?: { force?: boolean; targetFiles?: string[] },
): Promise<StageResult> {
    const start = Date.now();
    const errors: StageError[] = [];

    const maxDepth = await repo.getMaxDepthLevel();
    if (maxDepth < 5 && !options?.force) {
        return {
            stage: 6,
            filesProcessed: 0,
            nodesCreated: 0,
            edgesCreated: 0,
            durationMs: Date.now() - start,
            errors: [],
        };
    }

    const graph = await loadGraphFromDb(repo);
    if (graph.order === 0) {
        return {
            stage: 6,
            filesProcessed: 0,
            nodesCreated: 0,
            edgesCreated: 0,
            durationMs: Date.now() - start,
            errors: [],
        };
    }

    const communities = runCommunityDetection(graph);
    const pageRank = runPageRank(graph);
    const betweenness = runBetweenness(graph);

    const flows = traceExecutionFlows(graph, repo);
    const layers = detectLayers(graph, communities);

    const updates: Array<{
        nodeId: string;
        community: number;
        pageRank: number;
        betweenness: number;
    }> = [];
    graph.forEachNode((id: string) => {
        updates.push({
            nodeId: id,
            community: communities[id] ?? 0,
            pageRank: pageRank[id] ?? 0,
            betweenness: betweenness[id] ?? 0,
        });
    });

    await repo.updateNodeMetricsBatch(updates);

    await repo.deleteAllFlows();
    if (flows.length > 0) {
        await repo.insertFlows(flows);
    }

    const layerSummary = new Map<LayerKind, { nodeCount: number; nodeIds: string[] }>();
    for (const l of layers) {
        if (!layerSummary.has(l.layer)) {
            layerSummary.set(l.layer, { nodeCount: 0, nodeIds: [] });
        }
        const entry = layerSummary.get(l.layer)!;
        entry.nodeCount++;
        entry.nodeIds.push(l.nodeId);
    }
    const layerArray = [...layerSummary.entries()].map(([layer, data]) => ({
        layer,
        ...data,
    }));

    const boundaries: Array<{
        fromLayer: LayerKind;
        toLayer: LayerKind;
        edgeCount: number;
    }> = [];
    const layerMap = new Map<string, LayerKind>();
    for (const l of layers) {
        layerMap.set(l.nodeId, l.layer);
    }
    const boundaryCounter = new Map<string, number>();
    graph.forEachEdge(
        (_edge: string, _attrs: Record<string, unknown>, source: string, target: string) => {
            const srcLayer = layerMap.get(source);
            const tgtLayer = layerMap.get(target);
            if (srcLayer && tgtLayer && srcLayer !== tgtLayer) {
                const key = `${srcLayer}:${tgtLayer}`;
                boundaryCounter.set(key, (boundaryCounter.get(key) ?? 0) + 1);
            }
        },
    );
    for (const [key, count] of boundaryCounter) {
        const [fromLayer, toLayer] = key.split(':') as [LayerKind, LayerKind];
        boundaries.push({ fromLayer, toLayer, edgeCount: count });
    }

    const uniqueCommunities = new Set(Object.values(communities));
    const communityCount = uniqueCommunities.size;

    const pagerankEntries = Object.entries(pageRank)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
    const topHubs = pagerankEntries.map(([nodeId, pr]) => {
        const attrs = graph.getNodeAttributes(nodeId);
        return {
            nodeId,
            name: (attrs.name as string) ?? nodeId,
            pageRank: pr,
            betweenness: betweenness[nodeId] ?? 0,
        };
    });

    await repo.setMeta('layers', JSON.stringify(layerArray));
    await repo.setMeta('layer_boundaries', JSON.stringify(boundaries));
    await repo.setMeta('community_count', String(communityCount));
    await repo.setMeta('top_hubs', JSON.stringify(topHubs));

    const allFiles = await repo.getAllFileNodes();
    const filesToUpdate = allFiles.filter((f) => f.depthLevel >= 5 || options?.force);
    for (const file of filesToUpdate) {
        await repo.upsertFileNode({ ...file, depthLevel: 6 });
    }

    return {
        stage: 6,
        filesProcessed: filesToUpdate.length,
        nodesCreated: 0,
        edgesCreated: 0,
        durationMs: Date.now() - start,
        errors,
    };
}
