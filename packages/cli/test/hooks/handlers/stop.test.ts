import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StopHandler } from '#hooks/handlers/stop.js';
import { AttentionSet } from '#hooks/attention.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { DnaEngine } from '#dna/engine.js';
import type { StopPayload } from '#hooks/types.js';

function makeSessionStore(hotspots: string[] = []): SessionStore {
    return {
        getHotspots: vi.fn().mockResolvedValue(hotspots),
    } as unknown as SessionStore;
}

function makeDnaEngine(): DnaEngine {
    return {
        captureInstruction: vi.fn().mockReturnValue({}),
    } as unknown as DnaEngine;
}

function makePayload(sessionId = 'sess-1'): StopPayload {
    return {
        hook_event_name: 'Stop',
        session_id: sessionId,
        cwd: '/projects/my-app',
        stop_hook_active: false,
        last_assistant_message: 'Done.',
    };
}

describe('StopHandler', () => {
    let sessionStore: SessionStore;
    let attention: AttentionSet;
    let dnaEngine: DnaEngine;
    let handler: StopHandler;

    beforeEach(() => {
        sessionStore = makeSessionStore();
        attention = new AttentionSet();
        dnaEngine = makeDnaEngine();
        handler = new StopHandler({ sessionStore, attention, dnaEngine });
    });

    describe('lightweight mode', () => {
        it('ticks attention on every call', async () => {
            const tickSpy = vi.spyOn(attention, 'tick');

            await handler.handle(makePayload());

            expect(tickSpy).toHaveBeenCalledTimes(1);
        });

        it('ticks attention on each subsequent call', async () => {
            const tickSpy = vi.spyOn(attention, 'tick');

            await handler.handle(makePayload());
            await handler.handle(makePayload());
            await handler.handle(makePayload());

            expect(tickSpy).toHaveBeenCalledTimes(3);
        });
    });

    describe('heavyweight mode', () => {
        it('does not run heavyweight analysis before 10th call', async () => {
            for (let i = 0; i < 9; i++) {
                await handler.handle(makePayload());
            }

            expect(sessionStore.getHotspots).not.toHaveBeenCalled();
        });

        it('runs heavyweight analysis on the 10th call', async () => {
            for (let i = 0; i < 10; i++) {
                await handler.handle(makePayload());
            }

            expect(sessionStore.getHotspots).toHaveBeenCalledTimes(1);
            expect(sessionStore.getHotspots).toHaveBeenCalledWith('sess-1', 3);
        });

        it('runs heavyweight analysis again after another 10 calls', async () => {
            for (let i = 0; i < 20; i++) {
                await handler.handle(makePayload());
            }

            expect(sessionStore.getHotspots).toHaveBeenCalledTimes(2);
        });

        it('captures DNA entry for each hotspot found', async () => {
            const storeWithHotspots = makeSessionStore(['src/auth.ts', 'src/db.ts']);
            const handlerWithHotspots = new StopHandler({
                sessionStore: storeWithHotspots,
                attention,
                dnaEngine,
            });

            for (let i = 0; i < 10; i++) {
                await handlerWithHotspots.handle(makePayload());
            }

            expect(dnaEngine.captureInstruction).toHaveBeenCalledTimes(2);
            expect(dnaEngine.captureInstruction).toHaveBeenCalledWith(
                'Frequently editing src/auth.ts',
                'sess-1',
                'pattern',
            );
            expect(dnaEngine.captureInstruction).toHaveBeenCalledWith(
                'Frequently editing src/db.ts',
                'sess-1',
                'pattern',
            );
        });

        it('does not capture DNA entries when no hotspots found', async () => {
            for (let i = 0; i < 10; i++) {
                await handler.handle(makePayload());
            }

            expect(dnaEngine.captureInstruction).not.toHaveBeenCalled();
        });
    });

    describe('response', () => {
        it('never returns block decision', async () => {
            const result = await handler.handle(makePayload());

            expect(result).toEqual({});
        });

        it('returns empty response even on the 10th call', async () => {
            for (let i = 0; i < 9; i++) {
                await handler.handle(makePayload());
            }

            const result = await handler.handle(makePayload());

            expect(result).toEqual({});
        });
    });

    describe('error resilience', () => {
        it('handles missing session gracefully', async () => {
            const failingStore = {
                getHotspots: vi.fn().mockResolvedValue([]),
            } as unknown as SessionStore;

            const resilientHandler = new StopHandler({
                sessionStore: failingStore,
                attention,
                dnaEngine,
            });

            for (let i = 0; i < 10; i++) {
                await resilientHandler.handle(makePayload('nonexistent-session'));
            }

            const result = await resilientHandler.handle(makePayload('nonexistent-session'));

            expect(result).toEqual({});
        });

        it('returns empty response when heavyweight analysis throws', async () => {
            const errorStore = {
                getHotspots: vi.fn().mockRejectedValue(new Error('db error')),
            } as unknown as SessionStore;

            const errorHandler = new StopHandler({
                sessionStore: errorStore,
                attention,
                dnaEngine,
            });

            for (let i = 0; i < 9; i++) {
                await errorHandler.handle(makePayload());
            }

            const result = await errorHandler.handle(makePayload());

            expect(result).toEqual({});
        });
    });
});
