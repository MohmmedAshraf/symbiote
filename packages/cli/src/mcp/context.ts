import { createRequire } from 'node:module';
import type { SymbioteDB } from '../storage/db.js';
import { Repository } from '../storage/repository.js';
import { GraphQuery } from '../core/graph.js';
import { HybridSearch } from '../core/search.js';
import { buildGraphFromDb } from '../core/graph-builder.js';
import { IntentStore } from '../brain/intent.js';
import { HealthEngine } from '../brain/health/index.js';
import { DnaStorage } from '../dna/storage.js';
import { DnaEngine } from '../dna/engine.js';
import { EventBus } from '../events/bus.js';
import path from 'node:path';

const require = createRequire(import.meta.url);
const GraphConstructor = require('graphology');

type GraphInstance = InstanceType<typeof GraphConstructor>;

export interface ServerContextOptions {
    db: SymbioteDB;
    brainDir: string;
    symbioteHome: string;
}

export interface ServerContext {
    db: SymbioteDB;
    repo: Repository;
    graph: GraphQuery;
    graphology: GraphInstance;
    search: HybridSearch;
    intent: IntentStore;
    health: HealthEngine;
    dnaStorage: DnaStorage;
    dnaEngine: DnaEngine;
    eventBus: EventBus;
}

export async function createServerContext(options: ServerContextOptions): Promise<ServerContext> {
    const repo = new Repository(options.db);
    const graph = new GraphQuery(repo);
    const graphology = await buildGraphFromDb(options.db);
    const search = new HybridSearch(options.db, repo);
    const intent = new IntentStore(options.brainDir);
    const health = new HealthEngine(repo, intent, options.db);

    const dnaDir = path.join(options.symbioteHome, 'dna');
    const dnaStorage = new DnaStorage(dnaDir);
    const dnaEngine = new DnaEngine(dnaStorage);
    const eventBus = new EventBus();

    return {
        db: options.db,
        repo,
        graph,
        graphology,
        search,
        intent,
        health,
        dnaStorage,
        dnaEngine,
        eventBus,
    };
}
