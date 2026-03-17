import { createRequire } from 'node:module';
import type { Repository } from '#storage/repository.js';
import { Graph } from './types.js';
import type { GraphInstance } from './types.js';

/**
 * @deprecated Use packages/cli/src/cortex/stage-6-topology.ts instead.
 * This module uses the legacy Repository. Will be removed in next major version.
 */

const req = createRequire(import.meta.url);
const louvain = req('graphology-communities-louvain');
const centrality = req('graphology-metrics/centrality');

export interface AlgorithmResults {
    communities: Record<string, number>;
    pageRank: Record<string, number>;
    betweenness: Record<string, number>;
}

/** @deprecated Use Stage6Topology from cortex/stage-6-topology.ts instead. */
export class GraphAlgorithms {
    constructor(private repo: Repository) {}

    async loadGraph(): Promise<GraphInstance> {
        const nodes = await this.repo.getAllNodes();
        const edges = await this.repo.getAllEdges();

        const graph = new Graph({ multi: true, type: 'directed' });

        for (const node of nodes) {
            graph.addNode(node.id, {
                type: node.type,
                name: node.name,
                filePath: node.filePath,
                lineStart: node.lineStart,
                lineEnd: node.lineEnd,
                metadata: node.metadata,
            });
        }

        for (const edge of edges) {
            if (graph.hasNode(edge.sourceId) && graph.hasNode(edge.targetId)) {
                graph.addEdge(edge.sourceId, edge.targetId, {
                    type: edge.type,
                });
            }
        }

        return graph;
    }

    async runLouvain(preloaded?: GraphInstance): Promise<Record<string, number>> {
        const graph = preloaded ?? (await this.loadGraph());
        if (graph.order === 0) return {};
        return this.computeLouvain(graph);
    }

    async runPageRank(preloaded?: GraphInstance): Promise<Record<string, number>> {
        const graph = preloaded ?? (await this.loadGraph());
        if (graph.order === 0) return {};
        return centrality.pagerank(graph);
    }

    async runBetweennessCentrality(preloaded?: GraphInstance): Promise<Record<string, number>> {
        const graph = preloaded ?? (await this.loadGraph());
        if (graph.order === 0) return {};
        return centrality.betweenness(graph);
    }

    async runAll(): Promise<AlgorithmResults> {
        const graph = await this.loadGraph();
        if (graph.order === 0) {
            return { communities: {}, pageRank: {}, betweenness: {} };
        }

        const communities = this.computeLouvain(graph);
        const ranks = centrality.pagerank(graph);
        const betweenness = centrality.betweenness(graph);

        const updatedNodes: import('../storage/repository.js').NodeRecord[] = [];
        graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
            updatedNodes.push({
                id: nodeId,
                type: attrs.type as string,
                name: attrs.name as string,
                filePath: attrs.filePath as string,
                lineStart: attrs.lineStart as number,
                lineEnd: attrs.lineEnd as number,
                metadata: {
                    ...((attrs.metadata as Record<string, unknown>) ?? {}),
                    community: communities[nodeId] ?? -1,
                    pageRank: ranks[nodeId] ?? 0,
                    betweenness: betweenness[nodeId] ?? 0,
                },
            });
        });

        await this.repo.insertNodes(updatedNodes);

        return { communities, pageRank: ranks, betweenness };
    }

    private computeLouvain(graph: GraphInstance): Record<string, number> {
        const undirected = new Graph({ multi: false, type: 'undirected' });
        graph.forEachNode((node: string, attrs: Record<string, unknown>) => {
            undirected.addNode(node, attrs);
        });
        graph.forEachEdge(
            (_edge: string, _attrs: Record<string, unknown>, source: string, target: string) => {
                if (source !== target && !undirected.hasEdge(source, target)) {
                    undirected.addEdge(source, target);
                }
            },
        );
        return louvain(undirected);
    }
}
