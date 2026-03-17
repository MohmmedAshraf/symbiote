import type { SymbioteDB } from '../storage/db.js';
import { Repository } from '../storage/repository.js';
import { GraphAlgorithms } from './algorithms.js';
import type { GraphInstance } from './types.js';

export async function buildGraphFromDb(db: SymbioteDB): Promise<GraphInstance> {
    const repo = new Repository(db);
    const algorithms = new GraphAlgorithms(repo);
    return algorithms.loadGraph();
}
