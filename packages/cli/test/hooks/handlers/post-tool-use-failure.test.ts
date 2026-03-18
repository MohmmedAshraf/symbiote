import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Graph from 'graphology';
import { PostToolUseFailureHandler } from '#hooks/handlers/post-tool-use-failure.js';
import { AttentionSet } from '#hooks/attention.js';
import { EventBus } from '#events/bus.js';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { SessionStore } from '#hooks/session-store.js';
import type { PostToolUseFailurePayload } from '#hooks/types.js';
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

describe('PostToolUseFailureHandler', () => {
    let db: SymbioteDB;
    let sessionStore: SessionStore;
    let attention: AttentionSet;
    let eventBus: EventBus;
    let graph: InstanceType<typeof Graph>;
    let handler: PostToolUseFailureHandler;
    let emittedEvents: SymbioteEvent[];
    const SESSION_ID = 'test-session-failure-1';

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        sessionStore = new SessionStore(db);
        await sessionStore.startSession(SESSION_ID, Date.now());

        attention = new AttentionSet();
        eventBus = new EventBus();
        graph = buildGraph();
        emittedEvents = [];

        eventBus.on('*', (event) => {
            emittedEvents.push(event);
        });

        handler = new PostToolUseFailureHandler({
            sessionStore,
            attention,
            eventBus,
            graph,
            projectRoot: '/projects/my-app',
            sessionId: SESSION_ID,
        });
    });

    afterEach(async () => {
        await db.close();
    });

    it('records failure observation with tool_failure event', async () => {
        const payload: PostToolUseFailurePayload = {
            hook_event_name: 'PostToolUseFailure',
            session_id: SESSION_ID,
            cwd: '/projects/my-app',
            tool_name: 'Edit',
            tool_input: { file_path: '/projects/my-app/src/auth.ts' },
            error: 'File not found',
            is_interrupt: false,
        };

        await handler.handle(payload);

        const obs = await sessionStore.getObservations(SESSION_ID);
        expect(obs).toHaveLength(1);
        expect(obs[0].tool_name).toBe('Edit');
        expect(obs[0].event).toBe('tool_failure');
    });

    it('stores error message in metadata', async () => {
        const payload: PostToolUseFailurePayload = {
            hook_event_name: 'PostToolUseFailure',
            session_id: SESSION_ID,
            cwd: '/projects/my-app',
            tool_name: 'Write',
            tool_input: { file_path: '/projects/my-app/src/auth.ts' },
            error: 'Permission denied',
            is_interrupt: false,
        };

        await handler.handle(payload);

        const obs = await sessionStore.getObservations(SESSION_ID);
        const metadata = JSON.parse(obs[0].metadata!);
        expect(metadata.error).toBe('Permission denied');
    });

    it('correlates file_path with graph symbols', async () => {
        const payload: PostToolUseFailurePayload = {
            hook_event_name: 'PostToolUseFailure',
            session_id: SESSION_ID,
            cwd: '/projects/my-app',
            tool_name: 'Edit',
            tool_input: { file_path: '/projects/my-app/src/auth.ts' },
            error: 'Syntax error',
            is_interrupt: false,
        };

        await handler.handle(payload);

        const obs = await sessionStore.getObservations(SESSION_ID);
        const symbolsAffected = JSON.parse(obs[0].symbols_affected!);
        expect(symbolsAffected).toContain('fn:src/auth.ts:login');
    });

    it('fires intelligence:finding event', async () => {
        const payload: PostToolUseFailurePayload = {
            hook_event_name: 'PostToolUseFailure',
            session_id: SESSION_ID,
            cwd: '/projects/my-app',
            tool_name: 'Edit',
            tool_input: { file_path: '/projects/my-app/src/auth.ts' },
            error: 'Compile error',
            is_interrupt: false,
        };

        await handler.handle(payload);

        expect(emittedEvents.some((e) => e.type === 'intelligence:finding')).toBe(true);
    });

    it('handles missing file_path gracefully', async () => {
        const payload: PostToolUseFailurePayload = {
            hook_event_name: 'PostToolUseFailure',
            session_id: SESSION_ID,
            cwd: '/projects/my-app',
            tool_name: 'Bash',
            tool_input: { command: 'npm run build' },
            error: 'Build failed',
            is_interrupt: false,
        };

        await handler.handle(payload);

        const obs = await sessionStore.getObservations(SESSION_ID);
        expect(obs).toHaveLength(1);
        expect(obs[0].event).toBe('tool_failure');
        expect(obs[0].file_path).toBeNull();
        expect(obs[0].symbols_affected).toBeNull();
    });

    it('returns empty response', async () => {
        const payload: PostToolUseFailurePayload = {
            hook_event_name: 'PostToolUseFailure',
            session_id: SESSION_ID,
            cwd: '/projects/my-app',
            tool_name: 'Read',
            tool_input: {},
            error: 'some error',
            is_interrupt: false,
        };

        const result = await handler.handle(payload);

        expect(result).toEqual({});
    });
});
