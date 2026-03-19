import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Graph from 'graphology';
import { PostToolUseHandler } from '#hooks/handlers/post-tool-use.js';
import { AttentionSet } from '#hooks/attention.js';
import { EventBus } from '#events/bus.js';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { SessionStore } from '#hooks/session-store.js';
import type { PostToolUsePayload } from '#hooks/types.js';
import type { SymbioteEvent } from '#events/types.js';

function buildGraph(): InstanceType<typeof Graph> {
    const graph = new Graph({ multi: true, type: 'directed' });

    graph.addNode('file:src/auth.ts', {
        type: 'file',
        name: 'auth.ts',
        filePath: 'src/auth.ts',
    });

    graph.addNode('fn:src/auth.ts:login', {
        type: 'function',
        name: 'login',
        filePath: 'src/auth.ts',
        lineStart: 1,
        lineEnd: 10,
    });

    graph.addEdge('file:src/auth.ts', 'fn:src/auth.ts:login', { type: 'contains' });

    return graph;
}

describe('PostToolUseHandler (handlers/)', () => {
    let db: SymbioteDB;
    let sessionStore: SessionStore;
    let attention: AttentionSet;
    let eventBus: EventBus;
    let graph: InstanceType<typeof Graph>;
    let handler: PostToolUseHandler;
    let reindexCalled: string[];
    let fullRescanCalled: boolean;
    let emittedEvents: SymbioteEvent[];
    const SESSION_ID = 'test-session-1';

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        sessionStore = new SessionStore(db);
        await sessionStore.startSession(SESSION_ID, Date.now());

        attention = new AttentionSet();
        eventBus = new EventBus();
        graph = buildGraph();
        reindexCalled = [];
        fullRescanCalled = false;
        emittedEvents = [];

        eventBus.on('*', (event) => {
            emittedEvents.push(event);
        });

        handler = new PostToolUseHandler({
            projectRoot: '/projects/my-app',
            onReindexFile: async (relativePath) => {
                reindexCalled.push(relativePath);
            },
            onFullRescan: async () => {
                fullRescanCalled = true;
            },
            sessionStore,
            attention,
            eventBus,
            graph,
            sessionId: SESSION_ID,
        });
    });

    afterEach(async () => {
        await db.close();
    });

    describe('Edit tool', () => {
        it('triggers reindex and records observation', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            expect(reindexCalled).toEqual(['src/auth.ts']);
            expect(fullRescanCalled).toBe(false);

            const obs = await sessionStore.getObservations(SESSION_ID);
            expect(obs).toHaveLength(1);
            expect(obs[0].tool_name).toBe('Edit');
            expect(obs[0].event).toBe('file:edit');
            expect(obs[0].file_path).toBe('src/auth.ts');
        });

        it('emits file:edit event', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            expect(emittedEvents.some((e) => e.type === 'file:edit')).toBe(true);
        });

        it('updates attention set for edited file', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            expect(attention.getFile('src/auth.ts')).toBeDefined();
        });

        it('records symbol IDs in observation', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            const obs = await sessionStore.getObservations(SESSION_ID);
            const symbolsAffected = JSON.parse(obs[0].symbols_affected!);
            expect(symbolsAffected).toContain('fn:src/auth.ts:login');
        });
    });

    describe('Write tool', () => {
        it('triggers reindex and records observation with file:create event', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Write',
                tool_input: { file_path: '/projects/my-app/src/new-file.ts' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            expect(reindexCalled).toEqual(['src/new-file.ts']);

            const obs = await sessionStore.getObservations(SESSION_ID);
            expect(obs).toHaveLength(1);
            expect(obs[0].tool_name).toBe('Write');
            expect(obs[0].event).toBe('file:create');
            expect(obs[0].file_path).toBe('src/new-file.ts');
        });

        it('emits file:create event', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Write',
                tool_input: { file_path: '/projects/my-app/src/new-file.ts' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            expect(emittedEvents.some((e) => e.type === 'file:create')).toBe(true);
        });
    });

    describe('Read tool', () => {
        it('records observation but does not trigger reindex', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'file contents',
            };

            await handler.handle(payload);

            expect(reindexCalled).toEqual([]);
            expect(fullRescanCalled).toBe(false);

            const obs = await sessionStore.getObservations(SESSION_ID);
            expect(obs).toHaveLength(1);
            expect(obs[0].tool_name).toBe('Read');
            expect(obs[0].event).toBe('file:read');
            expect(obs[0].file_path).toBe('src/auth.ts');
        });

        it('emits file:read event', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'file contents',
            };

            await handler.handle(payload);

            expect(emittedEvents.some((e) => e.type === 'file:read')).toBe(true);
        });

        it('updates attention set for read file', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'contents',
            };

            await handler.handle(payload);

            expect(attention.getFile('src/auth.ts')).toBeDefined();
        });
    });

    describe('Bash tool', () => {
        it('triggers full rescan for git commit', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Bash',
                tool_input: { command: 'git commit -m "feat: add login"' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            expect(fullRescanCalled).toBe(true);
            expect(reindexCalled).toEqual([]);
        });

        it('does not trigger rescan for git status', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Bash',
                tool_input: { command: 'git status' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            expect(fullRescanCalled).toBe(false);
        });

        it('records observation for Bash commands', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Bash',
                tool_input: { command: 'npm run build' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            const obs = await sessionStore.getObservations(SESSION_ID);
            expect(obs).toHaveLength(1);
            expect(obs[0].tool_name).toBe('Bash');
            expect(obs[0].event).toBe('tool:use');
            expect(obs[0].file_path).toBeNull();
        });

        it('does not persist command in observation', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Bash',
                tool_input: { command: 'git commit -m "secret"' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            const obs = await sessionStore.getObservations(SESSION_ID);
            expect(obs[0].metadata).toBeNull();
        });
    });

    describe('Grep tool', () => {
        it('records observation with tool:use event', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Grep',
                tool_input: { pattern: 'login' },
                tool_output: 'matches',
            };

            await handler.handle(payload);

            expect(reindexCalled).toEqual([]);
            expect(fullRescanCalled).toBe(false);

            const obs = await sessionStore.getObservations(SESSION_ID);
            expect(obs).toHaveLength(1);
            expect(obs[0].tool_name).toBe('Grep');
            expect(obs[0].event).toBe('tool:use');
        });
    });

    describe('Glob tool', () => {
        it('records observation with tool:use event', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Glob',
                tool_input: { pattern: '**/*.ts' },
                tool_output: 'matches',
            };

            await handler.handle(payload);

            const obs = await sessionStore.getObservations(SESSION_ID);
            expect(obs).toHaveLength(1);
            expect(obs[0].tool_name).toBe('Glob');
            expect(obs[0].event).toBe('tool:use');
        });
    });

    describe('error resilience', () => {
        it('returns empty response even when reindex throws', async () => {
            const failingHandler = new PostToolUseHandler({
                projectRoot: '/projects/my-app',
                onReindexFile: async () => {
                    throw new Error('reindex failed');
                },
                onFullRescan: async () => {},
                sessionStore,
                attention,
                eventBus,
                graph,
                sessionId: SESSION_ID,
            });

            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            };

            const result = await failingHandler.handle(payload);

            expect(result).toEqual({});
        });
    });

    describe('attention tracking', () => {
        it('tracks symbols from edited file', async () => {
            const payload: PostToolUsePayload = {
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            };

            await handler.handle(payload);

            expect(attention.getSymbol('fn:src/auth.ts:login')).toBeDefined();
        });
    });

    describe('symbol diff feedback', () => {
        let preEditSymbols: Map<
            string,
            { name: string; kind: string; lineStart: number; lineEnd: number }[]
        >;

        beforeEach(() => {
            preEditSymbols = new Map();
        });

        function makeHandlerWithSymbolDiff(
            parseResult:
                | { name: string; type: string; lineStart: number; lineEnd: number }[]
                | null,
        ): PostToolUseHandler {
            return new PostToolUseHandler({
                projectRoot: '/projects/my-app',
                onReindexFile: async () => {},
                onFullRescan: async () => {},
                sessionStore,
                attention,
                eventBus,
                graph,
                sessionId: SESSION_ID,
                preEditSymbols,
                parseFileFn: parseResult
                    ? () => ({
                          filePath: 'src/auth.ts',
                          language: 'typescript',
                          nodes: parseResult.map((n) => ({
                              id: `fn:src/auth.ts:${n.name}`,
                              ...n,
                              filePath: 'src/auth.ts',
                          })),
                          edges: [],
                      })
                    : () => null,
            });
        }

        it('returns symbol diff when symbols change after edit', async () => {
            preEditSymbols.set('src/auth.ts', [
                { name: 'login', kind: 'function', lineStart: 1, lineEnd: 10 },
            ]);

            const h = makeHandlerWithSymbolDiff([
                { name: 'login', type: 'function', lineStart: 1, lineEnd: 15 },
                { name: 'logout', type: 'function', lineStart: 17, lineEnd: 25 },
            ]);

            const result = await h.handle({
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(result.hookSpecificOutput?.hookEventName).toBe('PostToolUse');
            expect(ctx).toContain('Modified: login');
            expect(ctx).toContain('Added: logout');
        });

        it('returns empty when no pre-edit symbols stashed', async () => {
            const h = makeHandlerWithSymbolDiff([
                { name: 'login', type: 'function', lineStart: 1, lineEnd: 10 },
            ]);

            const result = await h.handle({
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            });

            expect(result).toEqual({});
        });

        it('reports removed symbols', async () => {
            preEditSymbols.set('src/auth.ts', [
                { name: 'login', kind: 'function', lineStart: 1, lineEnd: 10 },
                { name: 'register', kind: 'function', lineStart: 12, lineEnd: 20 },
            ]);

            const h = makeHandlerWithSymbolDiff([
                { name: 'login', type: 'function', lineStart: 1, lineEnd: 10 },
            ]);

            const result = await h.handle({
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Removed: register');
        });

        it('returns empty when symbols unchanged', async () => {
            preEditSymbols.set('src/auth.ts', [
                { name: 'login', kind: 'function', lineStart: 1, lineEnd: 10 },
            ]);

            const h = makeHandlerWithSymbolDiff([
                { name: 'login', type: 'function', lineStart: 1, lineEnd: 10 },
            ]);

            const result = await h.handle({
                type: 'post_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/projects/my-app/src/auth.ts' },
                tool_output: 'ok',
            });

            expect(result).toEqual({});
        });
    });
});
