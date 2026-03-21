import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Graph from 'graphology';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { SessionStore } from '#hooks/session-store.js';
import { AttentionSet } from '#hooks/attention.js';
import { EventBus } from '#events/bus.js';
import { SessionStartHandler } from '#hooks/handlers/session-start.js';
import { PreToolUseHandler } from '#hooks/handlers/pre-tool-use.js';
import { PostToolUseHandler } from '#hooks/handlers/post-tool-use.js';
import { PostToolUseFailureHandler } from '#hooks/handlers/post-tool-use-failure.js';
import { SubagentStartHandler } from '#hooks/handlers/subagent-start.js';
import { StopHandler } from '#hooks/handlers/stop.js';
import { PreCompactHandler } from '#hooks/handlers/pre-compact.js';
import { SessionEndHandler } from '#hooks/handlers/session-end.js';
import type { DnaEngine } from '#dna/engine.js';
import type { DnaEntry } from '#dna/schema.js';
import type {
    PostToolUsePayload,
    PostToolUseFailurePayload,
    SubagentStartPayload,
    StopPayload,
    PreCompactPayload,
    SessionEndPayload,
} from '#hooks/types.js';

const SESSION_ID = 'integration-session-1';
const PROJECT_ROOT = '/project';

function makeDnaEntry(rule: string): DnaEntry {
    return {
        id: rule.slice(0, 20).replace(/\s/g, '-'),
        rule,
        reason: '',
        category: 'style',
        applies_to: [],
        source: 'explicit' as const,
        status: 'approved' as const,
        confidence: 0.9,
        evidence: {
            first_seen: '2026-01-01',
            last_seen: '2026-01-01',
            occurrences: 3,
            sessions: 1,
        },
        origin: { session_id: SESSION_ID },
    };
}

function makeDnaEngine(entries: DnaEntry[] = []): DnaEngine {
    return {
        getActiveEntries: vi.fn().mockReturnValue(entries),
        batchPassiveReinforce: vi.fn(),
        autoPromote: vi.fn(),
        decayUnseenEntries: vi.fn(),
        captureInstruction: vi.fn(),
    } as unknown as DnaEngine;
}

function buildGraph(): Graph {
    const g = new Graph({ type: 'directed', multi: true });

    g.addNode('file:src/service.ts', {
        type: 'file',
        name: 'service.ts',
        filePath: 'src/service.ts',
        lineStart: 1,
        lineEnd: 50,
    });
    g.addNode('fn:src/service.ts:processOrder', {
        type: 'function',
        name: 'processOrder',
        filePath: 'src/service.ts',
        lineStart: 5,
        lineEnd: 25,
    });
    g.addNode('fn:src/service.ts:validateOrder', {
        type: 'function',
        name: 'validateOrder',
        filePath: 'src/service.ts',
        lineStart: 27,
        lineEnd: 40,
    });
    g.addNode('file:src/api.ts', {
        type: 'file',
        name: 'api.ts',
        filePath: 'src/api.ts',
        lineStart: 1,
        lineEnd: 20,
    });
    g.addNode('fn:src/api.ts:handleOrder', {
        type: 'function',
        name: 'handleOrder',
        filePath: 'src/api.ts',
        lineStart: 1,
        lineEnd: 15,
    });

    g.addEdge('file:src/service.ts', 'fn:src/service.ts:processOrder', { type: 'contains' });
    g.addEdge('file:src/service.ts', 'fn:src/service.ts:validateOrder', { type: 'contains' });
    g.addEdge('fn:src/service.ts:processOrder', 'fn:src/service.ts:validateOrder', {
        type: 'calls',
    });
    g.addEdge('fn:src/api.ts:handleOrder', 'fn:src/service.ts:processOrder', { type: 'calls' });
    g.addEdge('file:src/api.ts', 'fn:src/api.ts:handleOrder', { type: 'contains' });

    return g;
}

describe('Session intelligence lifecycle integration', () => {
    let db: SymbioteDB;
    let sessionStore: SessionStore;
    let attention: AttentionSet;
    let eventBus: EventBus;
    let dnaEngine: DnaEngine;
    let graph: Graph;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        sessionStore = new SessionStore(db);
        attention = new AttentionSet();
        eventBus = new EventBus();
        graph = buildGraph();
        dnaEngine = makeDnaEngine([
            makeDnaEntry('use single quotes'),
            makeDnaEntry('prefer const over let'),
        ]);

        await sessionStore.startSession(SESSION_ID, Date.now());
    });

    afterEach(async () => {
        await db.close();
    });

    it('step 1 – SessionStart startup: returns project info and DNA context', async () => {
        const mockHealth = {
            analyze: vi.fn().mockResolvedValue({
                score: 100,
                categories: {
                    constraints: { score: 100, weight: 0.3, issueCount: 0 },
                    circularDeps: { score: 100, weight: 0.3, issueCount: 0 },
                    deadCode: { score: 100, weight: 0.2, issueCount: 0 },
                    coupling: { score: 100, weight: 0.2, issueCount: 0 },
                },
                constraintViolations: [],
                descriptiveConstraints: [],
                circularDeps: [],
                deadCode: [],
                couplingHotspots: [],
                timestamp: new Date().toISOString(),
            }),
        };
        const handler = new SessionStartHandler({
            dnaEngine,
            sessionStore,
            constraints: [{ scope: 'global', content: 'No any types' }],
            health: mockHealth as any,
            cachedHealth: null,
        });

        const result = await handler.handle({ sessionId: SESSION_ID, source: 'startup' });

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(result.hookSpecificOutput?.hookEventName).toBe('SessionStart');
        expect(ctx).toContain('Symbiote is active');
        expect(ctx).toContain('use single quotes');
        expect(ctx).toContain('No any types');
    });

    it('step 2 – PreToolUse Read: returns file context and updates attention', () => {
        const handler = new PreToolUseHandler({
            graph,
            projectRoot: PROJECT_ROOT,
            constraints: [],
            attention,
            dnaEngine,
        });

        const result = handler.handle({
            type: 'pre_tool_use',
            tool_name: 'Read',
            tool_input: { file_path: `${PROJECT_ROOT}/src/service.ts` },
        });

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('processOrder');
        expect(ctx).toContain('validateOrder');

        const entry = attention.getFile('src/service.ts');
        expect(entry).toBeDefined();
        expect(entry!.accessCount).toBe(1);
    });

    it('step 3 – PostToolUse Edit: records observation and updates attention', async () => {
        const reindexed: string[] = [];

        const handler = new PostToolUseHandler({
            graph,
            projectRoot: PROJECT_ROOT,
            onReindexFile: async (fp) => {
                reindexed.push(fp);
            },
            onFullRescan: async () => {},
            sessionStore,
            attention,
            eventBus,
            sessionId: SESSION_ID,
        });

        const payload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Edit',
            tool_input: { file_path: `${PROJECT_ROOT}/src/service.ts` },
            tool_output: 'File edited successfully',
        };

        await handler.handle(payload);

        expect(reindexed).toContain('src/service.ts');

        const observations = await sessionStore.getObservations(SESSION_ID);
        const editObs = observations.filter((o) => o.event === 'file:edit');
        expect(editObs.length).toBeGreaterThanOrEqual(1);
        expect(editObs[0].file_path).toBe('src/service.ts');

        const fileEntry = attention.getFile('src/service.ts');
        expect(fileEntry).toBeDefined();
        expect(fileEntry!.accessCount).toBeGreaterThanOrEqual(1);

        const symbolEntry = attention.getSymbol('fn:src/service.ts:processOrder');
        expect(symbolEntry).toBeDefined();
    });

    it('step 4 – PostToolUseFailure: records failure observation', async () => {
        const handler = new PostToolUseFailureHandler({
            sessionStore,
            attention,
            eventBus,
            graph,
            projectRoot: PROJECT_ROOT,
            sessionId: SESSION_ID,
        });

        const payload: PostToolUseFailurePayload = {
            hook_event_name: 'PostToolUseFailure',
            session_id: SESSION_ID,
            cwd: PROJECT_ROOT,
            tool_name: 'Edit',
            tool_input: { file_path: `${PROJECT_ROOT}/src/service.ts` },
            error: 'Permission denied',
            is_interrupt: false,
        };

        await handler.handle(payload);

        const observations = await sessionStore.getObservations(SESSION_ID);
        const failureObs = observations.filter((o) => o.event === 'tool_failure');
        expect(failureObs.length).toBeGreaterThanOrEqual(1);
        expect(failureObs[0].tool_name).toBe('Edit');
        const metadata = JSON.parse(failureObs[0].metadata!);
        expect(metadata.error).toBe('Permission denied');
    });

    it('step 5 – SubagentStart: returns DNA context and records observation', async () => {
        const handler = new SubagentStartHandler({
            dnaEngine,
            constraints: [{ scope: 'global', content: 'Always use strict types' }],
            sessionStore,
            sessionId: SESSION_ID,
        });

        const payload: SubagentStartPayload = {
            hook_event_name: 'SubagentStart',
            session_id: SESSION_ID,
            cwd: PROJECT_ROOT,
            agent_id: 'agent-xyz',
            agent_type: 'code_review',
        };

        const result = await handler.handle(payload);

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('use single quotes');
        expect(ctx).toContain('Always use strict types');

        const observations = await sessionStore.getObservations(SESSION_ID);
        const subagentObs = observations.filter((o) => o.event === 'subagent');
        expect(subagentObs.length).toBeGreaterThanOrEqual(1);
        expect(subagentObs[0].tool_name).toBe('Agent');
    });

    it('step 6 – Stop (10 times to trigger heavyweight): never blocks', async () => {
        const handler = new StopHandler({
            sessionStore,
            attention,
            dnaEngine,
        });

        for (let i = 0; i < 10; i++) {
            const payload: StopPayload = {
                hook_event_name: 'Stop',
                session_id: SESSION_ID,
                cwd: PROJECT_ROOT,
                stop_hook_active: false,
                last_assistant_message: `Message ${i}`,
            };
            const result = await handler.handle(payload);
            expect(result).toEqual({});
        }

        expect(dnaEngine.captureInstruction).not.toHaveBeenCalled();
    });

    it('step 7 – PreCompact: saves snapshot and returns context instruction', async () => {
        attention.touchFile('src/service.ts', 'edit');
        attention.touchFile('src/api.ts', 'edit');
        attention.touchSymbol('fn:src/service.ts:processOrder');

        const handler = new PreCompactHandler({
            sessionStore,
            attention,
            eventBus,
            sessionId: SESSION_ID,
        });

        const payload: PreCompactPayload = {
            hook_event_name: 'PreCompact',
            session_id: SESSION_ID,
            cwd: PROJECT_ROOT,
            trigger: 'auto',
            custom_instructions: '',
        };

        const result = await handler.handle(payload);

        expect(result.hookSpecificOutput?.hookEventName).toBe('PreCompact');
        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('Symbiote');

        const snapshot = await sessionStore.getSnapshot(SESSION_ID);
        expect(snapshot).not.toBeNull();
        const parsed = JSON.parse(snapshot!);
        expect(parsed.filesModified).toContain('src/service.ts');
        expect(parsed.filesModified).toContain('src/api.ts');
    });

    it('step 8 – SessionStart compact: includes snapshot data in context', async () => {
        await sessionStore.saveSnapshot(
            SESSION_ID,
            JSON.stringify({
                filesModified: ['src/service.ts', 'src/api.ts'],
                attention: ['src/service.ts'],
            }),
        );

        const mockHealth = {
            analyze: vi.fn().mockResolvedValue({
                score: 100,
                categories: {
                    constraints: { score: 100, weight: 0.3, issueCount: 0 },
                    circularDeps: { score: 100, weight: 0.3, issueCount: 0 },
                    deadCode: { score: 100, weight: 0.2, issueCount: 0 },
                    coupling: { score: 100, weight: 0.2, issueCount: 0 },
                },
                constraintViolations: [],
                descriptiveConstraints: [],
                circularDeps: [],
                deadCode: [],
                couplingHotspots: [],
                timestamp: new Date().toISOString(),
            }),
        };
        const handler = new SessionStartHandler({
            dnaEngine,
            sessionStore,
            constraints: [],
            health: mockHealth as any,
            cachedHealth: null,
        });

        const result = await handler.handle({ sessionId: SESSION_ID, source: 'compact' });

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('Session restored');
        expect(ctx).toContain('src/service.ts');
        expect(ctx).toContain('src/api.ts');
    });

    it('step 9 – SessionEnd: finalizes session and calls DNA lifecycle methods', async () => {
        await sessionStore.recordObservation({
            sessionId: SESSION_ID,
            timestamp: Date.now(),
            toolName: 'Read',
            event: 'file:read',
            filePath: 'src/service.ts',
        });

        const handler = new SessionEndHandler({
            sessionStore,
            dnaEngine,
            eventBus,
        });

        const payload: SessionEndPayload = {
            hook_event_name: 'SessionEnd',
            session_id: SESSION_ID,
            cwd: PROJECT_ROOT,
            reason: 'completed',
        };

        const result = await handler.handle(payload);
        expect(result).toEqual({});

        const session = await sessionStore.getSession(SESSION_ID);
        expect(session).not.toBeNull();
        expect(session!.ended_at).not.toBeNull();
        expect(session!.reason).toBe('completed');

        expect(dnaEngine.batchPassiveReinforce).toHaveBeenCalledTimes(1);
        expect(dnaEngine.autoPromote).toHaveBeenCalledTimes(1);
        expect(dnaEngine.decayUnseenEntries).toHaveBeenCalledWith(SESSION_ID);
    });

    it('full lifecycle: observation count grows across handlers', async () => {
        const reindexed: string[] = [];

        const postHandler = new PostToolUseHandler({
            graph,
            projectRoot: PROJECT_ROOT,
            onReindexFile: async (fp) => {
                reindexed.push(fp);
            },
            onFullRescan: async () => {},
            sessionStore,
            attention,
            eventBus,
            sessionId: SESSION_ID,
        });

        const failureHandler = new PostToolUseFailureHandler({
            sessionStore,
            attention,
            eventBus,
            graph,
            projectRoot: PROJECT_ROOT,
            sessionId: SESSION_ID,
        });

        const subagentHandler = new SubagentStartHandler({
            dnaEngine,
            constraints: [],
            sessionStore,
            sessionId: SESSION_ID,
        });

        await postHandler.handle({
            type: 'post_tool_use',
            tool_name: 'Read',
            tool_input: { file_path: `${PROJECT_ROOT}/src/service.ts` },
            tool_output: 'content',
        });

        await postHandler.handle({
            type: 'post_tool_use',
            tool_name: 'Edit',
            tool_input: { file_path: `${PROJECT_ROOT}/src/service.ts` },
            tool_output: 'edited',
        });

        await failureHandler.handle({
            hook_event_name: 'PostToolUseFailure',
            session_id: SESSION_ID,
            cwd: PROJECT_ROOT,
            tool_name: 'Write',
            tool_input: { file_path: `${PROJECT_ROOT}/src/new.ts` },
            error: 'disk full',
            is_interrupt: false,
        });

        await subagentHandler.handle({
            hook_event_name: 'SubagentStart',
            session_id: SESSION_ID,
            cwd: PROJECT_ROOT,
            agent_id: 'agent-1',
            agent_type: 'task',
        });

        const observations = await sessionStore.getObservations(SESSION_ID);
        expect(observations.length).toBeGreaterThanOrEqual(4);

        const events = observations.map((o) => o.event);
        expect(events).toContain('file:read');
        expect(events).toContain('file:edit');
        expect(events).toContain('tool_failure');
        expect(events).toContain('subagent');
    });
});
