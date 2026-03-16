import { createRequire } from 'node:module';
import type { Repository, NodeRecord } from '../storage/repository.js';

const require = createRequire(import.meta.url);
const Graph = require('graphology');
const louvain = require('graphology-communities-louvain');
const centrality = require('graphology-metrics/centrality');

type GraphInstance = InstanceType<typeof Graph>;

export interface AlgorithmResults {
    communities: Record<string, number>;
    pageRank: Record<string, number>;
    betweenness: Record<string, number>;
}

export class GraphAlgorithms {
    constructor(private repo: Repository) {}

    async loadGraph(): Promise<GraphInstance> {
        const nodes = await this.repo.getAllNodes();
        const edges = await this.repo.getAllEdges();

        const graph = new Graph({ multi: false, type: 'directed' });

        for (const node of nodes) {
            graph.addNode(node.id, {
                type: node.type,
                name: node.name,
                filePath: node.filePath,
                lineStart: node.lineStart,
                lineEnd: node.lineEnd,
            });
        }

        for (const edge of edges) {
            if (
                graph.hasNode(edge.sourceId) &&
                graph.hasNode(edge.targetId) &&
                !graph.hasEdge(edge.sourceId, edge.targetId)
            ) {
                graph.addEdge(edge.sourceId, edge.targetId, {
                    type: edge.type,
                });
            }
        }

        return graph;
    }

    async runLouvain(): Promise<Record<string, number>> {
        const graph = await this.loadGraph();

        if (graph.order === 0) return {};

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

    async runPageRank(): Promise<Record<string, number>> {
        const graph = await this.loadGraph();

        if (graph.order === 0) return {};

        return centrality.pagerank(graph);
    }

    async runBetweennessCentrality(): Promise<Record<string, number>> {
        const graph = await this.loadGraph();

        if (graph.order === 0) return {};

        return centrality.betweenness(graph);
    }

    async runAll(): Promise<AlgorithmResults> {
        const communities = await this.runLouvain();
        const ranks = await this.runPageRank();
        const betweenness = await this.runBetweennessCentrality();

        const allNodes = await this.repo.getAllNodes();

        for (const node of allNodes) {
            const metadata = node.metadata ?? {};
            metadata.community = communities[node.id] ?? -1;
            metadata.pageRank = ranks[node.id] ?? 0;
            metadata.betweenness = betweenness[node.id] ?? 0;

            await this.repo.insertNodes([{ ...node, metadata }]);
        }

        return {
            communities,
            pageRank: ranks,
            betweenness,
        };
    }
}
