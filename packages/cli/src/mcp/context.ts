import type { SymbioteDB } from '#storage/db.js';
import { Repository } from '#storage/repository.js';
import { GraphQuery } from '#core/graph.js';
import { HybridSearch } from '#core/search.js';
import { buildGraphFromDb } from '#core/graph-builder.js';
import { IntentStore } from '#brain/intent.js';
import { HealthEngine } from '#brain/health/index.js';
import { DnaStorage } from '#dna/storage.js';
import { DnaEngine } from '#dna/engine.js';
import { EventBus } from '#events/bus.js';
import { SessionTracker } from '#events/session.js';
import type { GraphInstance } from '#core/types.js';
import { CortexRepository } from '#cortex/repository.js';
import { CortexEngine } from '#cortex/engine.js';
import { createEvent } from '#events/types.js';
import { detectLanguage } from '#core/languages.js';
import { SessionStore } from '#hooks/session-store.js';
import { AttentionSet } from '#hooks/attention.js';
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
    sessionStore: SessionStore;
    attention: AttentionSet;
    onReindexFile: (relativePath: string) => void;
    onFullRescan: () => void;
    rootDir: string;
}

const WATCH_IGNORE = [
    '**/node_modules/**',
    '**/.git/**',
    '**/.brain/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    '**/__pycache__/**',
    '**/.venv/**',
    '**/vendor/**',
    '**/target/**',
];

const DEBOUNCE_MS = 300;

export async function createServerContext(options: ServerContextOptions): Promise<ServerContext> {
    const repo = new Repository(options.db);
    const cortexRepo = new CortexRepository(options.db);
    const cortexEngine = new CortexEngine(cortexRepo);
    const graph = new GraphQuery(repo);
    const graphology = await buildGraphFromDb(options.db);
    const search = new HybridSearch(options.db, repo);
    const intent = new IntentStore(options.brainDir);
    const health = new HealthEngine(cortexRepo, intent, options.db);

    const dnaDir = path.join(options.symbioteHome, 'dna');
    const dnaStorage = new DnaStorage(dnaDir);
    const dnaEngine = new DnaEngine(dnaStorage);
    const eventBus = new EventBus();
    const sessionTracker = new SessionTracker();
    const sessionStore = new SessionStore(options.db);
    const attention = new AttentionSet();

    eventBus.on('*', (event) => {
        sessionTracker.processEvent(event);
    });

    const pendingReindex = new Set<string>();
    const pendingDeletes = new Set<string>();
    let drainRunning = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const drainQueue = async (): Promise<void> => {
        if (drainRunning) return;
        drainRunning = true;
        try {
            while (pendingDeletes.size > 0) {
                const batch = [...pendingDeletes];
                pendingDeletes.clear();

                for (const fp of batch) {
                    await cortexRepo.deleteFileData(fp);
                    eventBus.emit(
                        createEvent('node:reindexed', {
                            filePath: fp,
                            metadata: { action: 'deleted' },
                        }),
                    );
                }
            }

            while (pendingReindex.size > 0) {
                const batch = [...pendingReindex];
                pendingReindex.clear();

                const absPaths = batch.map((fp) =>
                    path.isAbsolute(fp) ? fp : path.resolve(options.rootDir, fp),
                );

                await cortexEngine.run({
                    rootDir: options.rootDir,
                    force: true,
                    targetFiles: absPaths,
                });

                for (const fp of batch) {
                    eventBus.emit(
                        createEvent('node:reindexed', {
                            filePath: fp,
                        }),
                    );
                }
            }
        } catch (err) {
            process.stderr.write(`[symbiote] reindex failed: ${err}\n`);
        } finally {
            drainRunning = false;
        }
    };

    const scheduleDrain = (): void => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            drainQueue();
        }, DEBOUNCE_MS);
    };

    const startFileWatcher = async (): Promise<void> => {
        try {
            const chokidar = await import('chokidar');
            const watcher = chokidar.watch(options.rootDir, {
                ignored: WATCH_IGNORE,
                ignoreInitial: true,
                persistent: true,
                awaitWriteFinish: { stabilityThreshold: 200 },
            });

            watcher.on('change', (absPath: string) => {
                if (!detectLanguage(absPath)) return;
                const relPath = path.relative(options.rootDir, absPath);
                pendingReindex.add(relPath);
                scheduleDrain();
            });

            watcher.on('add', (absPath: string) => {
                if (!detectLanguage(absPath)) return;
                const relPath = path.relative(options.rootDir, absPath);
                pendingReindex.add(relPath);
                scheduleDrain();
            });

            watcher.on('unlink', (absPath: string) => {
                if (!detectLanguage(absPath)) return;
                const relPath = path.relative(options.rootDir, absPath);
                pendingDeletes.add(relPath);
                pendingReindex.delete(relPath);
                scheduleDrain();
            });
        } catch (err) {
            process.stderr.write(`[symbiote] file watcher failed: ${err}\n`);
        }
    };

    startFileWatcher();

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
        sessionStore,
        attention,
        onReindexFile: (relativePath: string): void => {
            pendingReindex.add(relativePath);
            scheduleDrain();
        },
        onFullRescan: (): void => {
            pendingReindex.add('.');
            scheduleDrain();
        },
        rootDir: options.rootDir,
    };
}
