import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SubagentStartHandler } from '#hooks/handlers/subagent-start.js';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { SessionStore } from '#hooks/session-store.js';
import type { SubagentStartPayload } from '#hooks/types.js';
import type { DnaEngine } from '#dna/engine.js';
import type { ConstraintRef } from '#hooks/handlers/pre-tool-use.js';

function makeDnaEngine(
    entries: Array<{ category: string; content: string; status?: string }>,
): DnaEngine {
    return {
        getActiveEntries: () =>
            entries
                .filter((e) => (e.status ?? 'approved') !== 'rejected')
                .map((e) => ({
                    frontmatter: {
                        id: e.content,
                        category: e.category as never,
                        confidence: 1,
                        source: 'explicit' as const,
                        status: (e.status ?? 'approved') as never,
                        firstSeen: '2024-01-01',
                        lastSeen: '2024-01-01',
                        occurrences: 1,
                        sessionIds: [],
                    },
                    content: e.content,
                })),
    } as unknown as DnaEngine;
}

const BASE_PAYLOAD: SubagentStartPayload = {
    hook_event_name: 'SubagentStart',
    session_id: 'test-session-subagent-1',
    cwd: '/projects/my-app',
    agent_id: 'agent-abc',
    agent_type: 'code_review',
};

describe('SubagentStartHandler', () => {
    let db: SymbioteDB;
    let sessionStore: SessionStore;
    let dnaEngine: DnaEngine;
    let constraints: ConstraintRef[];
    let handler: SubagentStartHandler;
    const SESSION_ID = 'test-session-subagent-1';

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        sessionStore = new SessionStore(db);
        await sessionStore.startSession(SESSION_ID, Date.now());

        dnaEngine = makeDnaEngine([
            { category: 'style', content: 'use single quotes' },
            { category: 'preferences', content: 'prefer const over let' },
        ]);

        constraints = [
            { scope: 'global', content: 'no inline styles' },
            { scope: 'src/', content: 'no console.log' },
        ];

        handler = new SubagentStartHandler({
            dnaEngine,
            constraints,
            sessionStore,
            sessionId: SESSION_ID,
        });
    });

    afterEach(async () => {
        await db.close();
    });

    it('returns DNA summary in additionalContext', async () => {
        const result = await handler.handle(BASE_PAYLOAD);

        expect(result.hookSpecificOutput?.additionalContext).toContain('use single quotes');
        expect(result.hookSpecificOutput?.additionalContext).toContain('prefer const over let');
    });

    it('includes global constraints in additionalContext', async () => {
        const result = await handler.handle(BASE_PAYLOAD);

        expect(result.hookSpecificOutput?.additionalContext).toContain('no inline styles');
    });

    it('records subagent observation with agent_type in metadata', async () => {
        await handler.handle(BASE_PAYLOAD);

        const obs = await sessionStore.getObservations(SESSION_ID);
        expect(obs).toHaveLength(1);
        expect(obs[0].event).toBe('subagent');
        expect(obs[0].tool_name).toBe('Agent');
        const metadata = JSON.parse(obs[0].metadata!);
        expect(metadata.agent_type).toBe('code_review');
    });

    it('sets hookEventName to SubagentStart', async () => {
        const result = await handler.handle(BASE_PAYLOAD);

        expect(result.hookSpecificOutput?.hookEventName).toBe('SubagentStart');
    });

    it('handles empty DNA entries gracefully', async () => {
        const emptyDnaHandler = new SubagentStartHandler({
            dnaEngine: makeDnaEngine([]),
            constraints: [],
            sessionStore,
            sessionId: SESSION_ID,
        });

        const result = await emptyDnaHandler.handle(BASE_PAYLOAD);

        expect(result).toEqual({});
    });

    it('does not include non-global constraints', async () => {
        const result = await handler.handle(BASE_PAYLOAD);

        expect(result.hookSpecificOutput?.additionalContext).not.toContain('no console.log');
    });
});
