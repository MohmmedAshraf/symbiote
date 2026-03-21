import type { SymbioteDB } from '#storage/db.js';
import { Repository } from '#storage/repository.js';
import { GraphQuery } from '#core/graph.js';
import { HybridSearch } from '#core/search.js';
import { buildGraphFromDb } from '#core/graph-builder.js';
import { IntentStore } from '#brain/intent.js';
import { HealthEngine } from '#brain/health/index.js';
import type { HealthReport } from '#brain/health/index.js';
import { ProfileStorage } from '#dna/profile.js';
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
import { BrainMetricsEngine } from '#brain/metrics.js';
import { SymbolCache } from '#hooks/symbol-cache.js';
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
    profileStorage: ProfileStorage;
    dnaEngine: DnaEngine;
    eventBus: EventBus;
    sessionTracker: SessionTracker;
    sessionStore: SessionStore;
    attention: AttentionSet;
    metrics: BrainMetricsEngine;
    preEditSymbols: Map<
        string,
        { name: string; kind: string; lineStart: number; lineEnd: number }[]
    >;
    symbolCache: SymbolCache;
    cachedHealth: { report: HealthReport; timestamp: number } | null;
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

    const profileStorage = new ProfileStorage(options.symbioteHome);
    const dnaEngine = new DnaEngine(profileStorage);
    const eventBus = new EventBus();
    const sessionTracker = new SessionTracker();
    const sessionStore = new SessionStore(options.db);
    const attention = new AttentionSet();
    const metrics = new BrainMetricsEngine(graphology, attention);

    const symbolCache = new SymbolCache();

    const rebuildSymbolCache = (): void => {
        const topNodes: {
            name: string;
            filePath: string;
            lineStart: number;
            kind: string;
            pagerank: number;
        }[] = [];
        graphology.forEachNode((nodeId, attrs) => {
            const pagerank = attrs.pagerank as number | undefined;
            if (attrs.type !== 'file' && pagerank !== undefined && pagerank > 0) {
                topNodes.push({
                    name: (attrs.name as string | undefined) ?? nodeId,
                    filePath: (attrs.filePath as string | undefined) ?? '',
                    lineStart: (attrs.lineStart as number | undefined) ?? 0,
                    kind: (attrs.type as string | undefined) ?? 'unknown',
                    pagerank,
                });
            }
        });
        topNodes.sort((a, b) => b.pagerank - a.pagerank);
        symbolCache.rebuild(topNodes.slice(0, 200));
    };

    rebuildSymbolCache();

    let metricsTimer: ReturnType<typeof setTimeout> | null = null;
    const METRICS_DEBOUNCE_MS = 500;

    const emitMetrics = (): void => {
        try {
            const snapshot = metrics.compute();
            eventBus.emit(
                createEvent('brain:metrics', {
                    metadata: snapshot as unknown as Record<string, unknown>,
                }),
            );
        } catch {
            // Metrics must never crash
        }
    };

    const scheduleMetrics = (): void => {
        if (metricsTimer) clearTimeout(metricsTimer);
        metricsTimer = setTimeout(emitMetrics, METRICS_DEBOUNCE_MS);
    };

    eventBus.on('*', (event) => {
        sessionTracker.processEvent(event);
        if (
            event.type === 'file:read' ||
            event.type === 'file:edit' ||
            event.type === 'file:create'
        ) {
            metrics.recordEvent(event.type);
            scheduleMetrics();
        }
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

    eventBus.on('node:reindexed', () => {
        rebuildSymbolCache();
    });

    search.warm().catch(() => {});

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
        profileStorage,
        dnaEngine,
        eventBus,
        sessionTracker,
        sessionStore,
        attention,
        metrics,
        preEditSymbols: new Map(),
        symbolCache,
        cachedHealth: null,
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
