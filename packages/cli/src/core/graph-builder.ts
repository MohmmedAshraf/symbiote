import type { SymbioteDB } from '../storage/db.js';
import { Repository } from '../storage/repository.js';
import { Graph } from './types.js';
import type { GraphInstance } from './types.js';

export async function buildGraphFromDb(db: SymbioteDB): Promise<GraphInstance> {
    const repo = new Repository(db);
    const nodes = await repo.getAllNodes();
    const edges = await repo.getAllEdges();

    const graph = new Graph({ multi: true, type: 'directed' });

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
        if (graph.hasNode(edge.sourceId) && graph.hasNode(edge.targetId)) {
            graph.addEdge(edge.sourceId, edge.targetId, {
                type: edge.type,
            });
        }
    }

    return graph;
}
