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
import { SessionTracker } from '../events/session.js';
import type { GraphInstance } from '../core/types.js';
import { CortexRepository } from '../cortex/repository.js';
import { CortexEngine } from '../cortex/engine.js';
import path from 'node:path';

export interface ServerContextOptions {
    db: SymbioteDB;
    brainDir: string;
    symbioteHome: string;
    rootDir: string;
}

export interface ServerContext {
    db: SymbioteDB;
    repo: Repository;
    cortexRepo: CortexRepository;
    cortexEngine: CortexEngine;
    graph: GraphQuery;
    graphology: GraphInstance;
    search: HybridSearch;
    intent: IntentStore;
    health: HealthEngine;
    dnaStorage: DnaStorage;
    dnaEngine: DnaEngine;
    eventBus: EventBus;
    sessionTracker: SessionTracker;
    rootDir: string;
}

export async function createServerContext(options: ServerContextOptions): Promise<ServerContext> {
    const repo = new Repository(options.db);
    const cortexRepo = new CortexRepository(options.db);
    const cortexEngine = new CortexEngine(cortexRepo);
    const graph = new GraphQuery(repo);
    const graphology = await buildGraphFromDb(options.db);
    const search = new HybridSearch(options.db, repo);
    const intent = new IntentStore(options.brainDir);
    const health = new HealthEngine(repo, intent, options.db);

    const dnaDir = path.join(options.symbioteHome, 'dna');
    const dnaStorage = new DnaStorage(dnaDir);
    const dnaEngine = new DnaEngine(dnaStorage);
    const eventBus = new EventBus();
    const sessionTracker = new SessionTracker();

    eventBus.on('*', (event) => {
        sessionTracker.processEvent(event);
    });

    return {
        db: options.db,
        repo,
        cortexRepo,
        cortexEngine,
        graph,
        graphology,
        search,
        intent,
        health,
        dnaStorage,
        dnaEngine,
        eventBus,
        sessionTracker,
        rootDir: options.rootDir,
    };
}
