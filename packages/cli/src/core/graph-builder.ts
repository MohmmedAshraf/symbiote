import { createRequire } from 'node:module';
import type { SymbioteDB } from '#storage/db.js';
import { Repository } from '#storage/repository.js';
import { CortexRepository } from '#cortex/repository.js';
import { GraphAlgorithms } from './algorithms.js';
import { Graph } from './types.js';
import type { GraphInstance } from './types.js';

const req = createRequire(import.meta.url);
const louvain = req('graphology-communities-louvain');
const centrality = req('graphology-metrics/centrality');

export async function buildGraphFromCortex(db: SymbioteDB): Promise<GraphInstance | null> {
    const cortex = new CortexRepository(db);
    const stats = await cortex.getStats();

    const totalNodes =
        stats.files +
        stats.functions +
        stats.classes +
        stats.methods +
        stats.interfaces +
        stats.types +
        stats.variables;
    if (totalNodes === 0) return null;

    const graph = new Graph({ multi: true, type: 'directed' });

    const files = await cortex.getAllFileNodes();
    for (const f of files) {
        graph.addNode(f.id, { type: 'file', name: f.path, filePath: f.path });
    }

    const symbolRows = await cortex.getAllSymbols();
    for (const s of symbolRows) {
        if (!graph.hasNode(s.id)) {
            graph.addNode(s.id, {
                type: s.kind,
                name: s.name,
                filePath: s.filePath,
                lineStart: s.lineStart,
                lineEnd: s.lineEnd,
            });
        }
    }

    const edgeTables: { table: string; kind: string }[] = [
        { table: 'edges_calls', kind: 'calls' },
        { table: 'edges_imports', kind: 'imports' },
        { table: 'edges_extends', kind: 'extends' },
        { table: 'edges_implements', kind: 'implements' },
        { table: 'edges_contains', kind: 'contains' },
        { table: 'edges_returns', kind: 'returns' },
        { table: 'edges_reads', kind: 'reads' },
        { table: 'edges_writes', kind: 'writes' },
    ];

    for (const { table, kind } of edgeTables) {
        const rows = await db.all<{ source_id: string; target_id: string }>(
            `SELECT source_id, target_id FROM ${table}`,
        );
        for (const row of rows) {
            if (graph.hasNode(row.source_id) && graph.hasNode(row.target_id)) {
                graph.addEdge(row.source_id, row.target_id, { type: kind });
            }
        }
    }

    if (graph.size > 0) {
        runTopologyOnGraph(graph);
    }

    return graph;
}

function runTopologyOnGraph(graph: GraphInstance): void {
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

    const communities: Record<string, number> = louvain(undirected);
    const ranks = centrality.pagerank(graph);
    const betweennessValues = centrality.betweenness(graph);

    graph.forEachNode((nodeId: string) => {
        graph.setNodeAttribute(nodeId, 'community', communities[nodeId] ?? -1);
        graph.setNodeAttribute(nodeId, 'pagerank', ranks[nodeId] ?? 0);
        graph.setNodeAttribute(nodeId, 'centrality', betweennessValues[nodeId] ?? 0);
    });
}

export async function buildGraphFromDb(db: SymbioteDB): Promise<GraphInstance> {
    const cortexGraph = await buildGraphFromCortex(db);
    if (cortexGraph && cortexGraph.order > 0) return cortexGraph;

    const repo = new Repository(db);
    const algorithms = new GraphAlgorithms(repo);
    return algorithms.loadGraph();
}
