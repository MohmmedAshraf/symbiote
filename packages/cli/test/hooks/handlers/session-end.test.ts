import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionEndHandler } from '#hooks/handlers/session-end.js';
import { SessionStore } from '#hooks/session-store.js';
import { EventBus } from '#events/bus.js';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import type { DnaEngine } from '#dna/engine.js';
import type { SessionEndPayload } from '#hooks/types.js';
import type { SymbioteEvent } from '#events/types.js';

function makeDnaEngine(): DnaEngine {
    return {
        batchPassiveReinforce: vi.fn(),
        autoPromote: vi.fn(),
        decayUnseenEntries: vi.fn(),
    } as unknown as DnaEngine;
}

function makePayload(sessionId = 'sess-1', reason = 'normal'): SessionEndPayload {
    return {
        hook_event_name: 'SessionEnd',
        session_id: sessionId,
        cwd: '/projects/my-app',
        reason,
    };
}

describe('SessionEndHandler', () => {
    let db: SymbioteDB;
    let sessionStore: SessionStore;
    let dnaEngine: DnaEngine;
    let eventBus: EventBus;
    let handler: SessionEndHandler;
    let emittedEvents: SymbioteEvent[];

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        sessionStore = new SessionStore(db);
        dnaEngine = makeDnaEngine();
        eventBus = new EventBus();
        emittedEvents = [];

        eventBus.on('*', (event) => {
            emittedEvents.push(event);
        });

        handler = new SessionEndHandler({ sessionStore, dnaEngine, eventBus });
    });

    afterEach(async () => {
        await db.close();
    });

    describe('session finalization', () => {
        it('finalizes session record with tool counts', async () => {
            await sessionStore.startSession('sess-1', 1000);
            await sessionStore.recordObservation({
                sessionId: 'sess-1',
                timestamp: 1100,
                toolName: 'Read',
                event: 'file:read',
                filePath: 'src/auth.ts',
            });
            await sessionStore.recordObservation({
                sessionId: 'sess-1',
                timestamp: 1200,
                toolName: 'Edit',
                event: 'file:edit',
                filePath: 'src/auth.ts',
            });

            await handler.handle(makePayload('sess-1', 'completed'));

            const session = await sessionStore.getSession('sess-1');
            expect(session).not.toBeNull();
            expect(session!.ended_at).not.toBeNull();
            expect(session!.reason).toBe('completed');
            const toolCounts = JSON.parse(session!.tool_counts!);
            expect(toolCounts['Read']).toBe(1);
            expect(toolCounts['Edit']).toBe(1);
        });

        it('populates files_touched from hotspots', async () => {
            await sessionStore.startSession('sess-1', 1000);
            for (let i = 0; i < 3; i++) {
                await sessionStore.recordObservation({
                    sessionId: 'sess-1',
                    timestamp: 1000 + i,
                    toolName: 'Edit',
                    event: 'file:edit',
                    filePath: 'src/hot.ts',
                });
            }

            await handler.handle(makePayload());

            const session = await sessionStore.getSession('sess-1');
            expect(session!.files_touched).not.toBeNull();
            const filesTouched = JSON.parse(session!.files_touched!);
            expect(filesTouched).toContain('src/hot.ts');
        });
    });

    describe('DNA confidence lifecycle', () => {
        it('calls batchPassiveReinforce', async () => {
            await sessionStore.startSession('sess-1', 1000);

            await handler.handle(makePayload());

            expect(dnaEngine.batchPassiveReinforce).toHaveBeenCalledTimes(1);
        });

        it('calls autoPromote', async () => {
            await sessionStore.startSession('sess-1', 1000);

            await handler.handle(makePayload());

            expect(dnaEngine.autoPromote).toHaveBeenCalledTimes(1);
        });

        it('calls decayUnseenEntries with sessionId', async () => {
            await sessionStore.startSession('sess-1', 1000);

            await handler.handle(makePayload('sess-1'));

            expect(dnaEngine.decayUnseenEntries).toHaveBeenCalledWith('sess-1');
        });

        it('calls all three DNA lifecycle methods in sequence', async () => {
            await sessionStore.startSession('sess-1', 1000);
            const callOrder: string[] = [];

            (dnaEngine.batchPassiveReinforce as ReturnType<typeof vi.fn>).mockImplementation(() => {
                callOrder.push('batchPassiveReinforce');
            });
            (dnaEngine.autoPromote as ReturnType<typeof vi.fn>).mockImplementation(() => {
                callOrder.push('autoPromote');
            });
            (dnaEngine.decayUnseenEntries as ReturnType<typeof vi.fn>).mockImplementation(() => {
                callOrder.push('decayUnseenEntries');
            });

            await handler.handle(makePayload());

            expect(callOrder).toEqual([
                'batchPassiveReinforce',
                'autoPromote',
                'decayUnseenEntries',
            ]);
        });
    });

    describe('events', () => {
        it('fires intelligence:snapshot event', async () => {
            await sessionStore.startSession('sess-1', 1000);

            await handler.handle(makePayload('sess-1', 'normal'));

            const snapshotEvent = emittedEvents.find((e) => e.type === 'intelligence:snapshot');
            expect(snapshotEvent).toBeDefined();
            expect(snapshotEvent!.data.metadata).toMatchObject({
                sessionId: 'sess-1',
                reason: 'normal',
            });
        });
    });

    describe('error resilience', () => {
        it('handles session that was never started gracefully', async () => {
            const result = await handler.handle(makePayload('nonexistent-session'));

            expect(result).toEqual({});
            expect(dnaEngine.batchPassiveReinforce).not.toHaveBeenCalled();
            expect(dnaEngine.autoPromote).not.toHaveBeenCalled();
            expect(dnaEngine.decayUnseenEntries).not.toHaveBeenCalled();
        });

        it('returns empty response even when DNA lifecycle throws', async () => {
            await sessionStore.startSession('sess-1', 1000);
            (dnaEngine.batchPassiveReinforce as ReturnType<typeof vi.fn>).mockImplementation(() => {
                throw new Error('dna error');
            });

            const result = await handler.handle(makePayload());

            expect(result).toEqual({});
        });

        it('never returns block decision', async () => {
            await sessionStore.startSession('sess-1', 1000);

            const result = await handler.handle(makePayload());

            expect(result).toEqual({});
        });
    });
});
