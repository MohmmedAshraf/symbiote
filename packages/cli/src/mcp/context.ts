import type { SynapseDB } from '../storage/db.js';
import { Repository } from '../storage/repository.js';
import { GraphQuery } from '../core/graph.js';
import { IntentStore } from '../brain/intent.js';
import { HealthEngine } from '../brain/health/index.js';
import { DnaStorage } from '../dna/storage.js';
import { DnaEngine } from '../dna/engine.js';
import path from 'node:path';

export interface ServerContextOptions {
    db: SynapseDB;
    brainDir: string;
    synapseHome: string;
}

export interface ServerContext {
    db: SynapseDB;
    repo: Repository;
    graph: GraphQuery;
    intent: IntentStore;
    health: HealthEngine;
    dnaStorage: DnaStorage;
    dnaEngine: DnaEngine;
}

export function createServerContext(
    options: ServerContextOptions
): ServerContext {
    const repo = new Repository(options.db);
    const graph = new GraphQuery(repo);
    const intent = new IntentStore(options.brainDir);
    const health = new HealthEngine(repo, intent, options.db);

    const dnaDir = path.join(options.synapseHome, 'dna');
    const dnaStorage = new DnaStorage(dnaDir);
    const dnaEngine = new DnaEngine(dnaStorage);

    return {
        db: options.db,
        repo,
        graph,
        intent,
        health,
        dnaStorage,
        dnaEngine,
    };
}
