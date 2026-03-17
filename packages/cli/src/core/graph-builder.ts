import type { SymbioteDB } from '../storage/db.js';
import { Repository } from '../storage/repository.js';
import { CortexRepository } from '../cortex/repository.js';
import { GraphAlgorithms } from './algorithms.js';
import { Graph } from './types.js';
import type { GraphInstance } from './types.js';

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

    return graph;
}

export async function buildGraphFromDb(db: SymbioteDB): Promise<GraphInstance> {
    const cortexGraph = await buildGraphFromCortex(db);
    if (cortexGraph && cortexGraph.order > 0) return cortexGraph;

    const repo = new Repository(db);
    const algorithms = new GraphAlgorithms(repo);
    return algorithms.loadGraph();
}
