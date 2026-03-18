import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { SessionStore } from '#hooks/session-store.js';

describe('SessionStore', () => {
    let db: SymbioteDB;
    let store: SessionStore;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        store = new SessionStore(db);
    });

    afterEach(async () => {
        await db.close();
    });

    describe('startSession', () => {
        it('inserts a new session', async () => {
            await store.startSession('s1', 1000);
            const session = await store.getSession('s1');

            expect(session).not.toBeNull();
            expect(session!.session_id).toBe('s1');
            expect(Number(session!.started_at)).toBe(1000);
            expect(session!.ended_at).toBeNull();
        });

        it('is idempotent when called with the same session_id', async () => {
            await store.startSession('s1', 1000);
            await store.startSession('s1', 9999);

            const session = await store.getSession('s1');
            expect(Number(session!.started_at)).toBe(1000);
        });
    });

    describe('endSession', () => {
        it('updates session with final stats', async () => {
            await store.startSession('s1', 1000);
            await store.endSession('s1', {
                endedAt: 2000,
                reason: 'completed',
                filesTouched: ['src/a.ts', 'src/b.ts'],
                symbolsModified: ['fnA', 'fnB'],
                toolCounts: { Read: 3, Edit: 2 },
                failureCount: 1,
                interactionCount: 5,
            });

            const session = await store.getSession('s1');
            expect(Number(session!.ended_at)).toBe(2000);
            expect(session!.reason).toBe('completed');
            expect(session!.failure_count).toBe(1);
            expect(session!.interaction_count).toBe(5);
            expect(JSON.parse(session!.files_touched!)).toEqual(['src/a.ts', 'src/b.ts']);
            expect(JSON.parse(session!.symbols_modified!)).toEqual(['fnA', 'fnB']);
            expect(JSON.parse(session!.tool_counts!)).toEqual({ Read: 3, Edit: 2 });
        });

        it('handles null optional fields gracefully', async () => {
            await store.startSession('s1', 1000);
            await store.endSession('s1', { endedAt: 2000 });

            const session = await store.getSession('s1');
            expect(session!.files_touched).toBeNull();
            expect(session!.symbols_modified).toBeNull();
            expect(session!.tool_counts).toBeNull();
            expect(session!.reason).toBeNull();
        });
    });

    describe('getSession', () => {
        it('returns null for unknown session', async () => {
            const session = await store.getSession('nonexistent');
            expect(session).toBeNull();
        });
    });

    describe('recordObservation / getObservations', () => {
        it('records and retrieves observations for a session', async () => {
            await store.startSession('s1', 1000);
            await store.recordObservation({
                sessionId: 's1',
                timestamp: 1100,
                toolName: 'Read',
                event: 'file:read',
                filePath: 'src/index.ts',
                symbolsAffected: ['main'],
                metadata: { lines: 50 },
            });
            await store.recordObservation({
                sessionId: 's1',
                timestamp: 1200,
                toolName: 'Edit',
                event: 'file:edit',
                filePath: 'src/index.ts',
            });

            const obs = await store.getObservations('s1');
            expect(obs).toHaveLength(2);
            expect(obs[0].tool_name).toBe('Read');
            expect(obs[0].event).toBe('file:read');
            expect(obs[0].file_path).toBe('src/index.ts');
            expect(JSON.parse(obs[0].symbols_affected!)).toEqual(['main']);
            expect(JSON.parse(obs[0].metadata!)).toEqual({ lines: 50 });
            expect(obs[1].tool_name).toBe('Edit');
        });

        it('returns empty array for session with no observations', async () => {
            await store.startSession('s1', 1000);
            const obs = await store.getObservations('s1');
            expect(obs).toHaveLength(0);
        });

        it('handles optional fields as null', async () => {
            await store.startSession('s1', 1000);
            await store.recordObservation({
                sessionId: 's1',
                timestamp: 1100,
                toolName: 'Bash',
                event: 'tool:use',
            });

            const obs = await store.getObservations('s1');
            expect(obs[0].file_path).toBeNull();
            expect(obs[0].symbols_affected).toBeNull();
            expect(obs[0].metadata).toBeNull();
        });
    });

    describe('getToolCounts', () => {
        it('returns counts grouped by tool_name', async () => {
            await store.startSession('s1', 1000);
            await store.recordObservation({
                sessionId: 's1',
                timestamp: 1,
                toolName: 'Read',
                event: 'file:read',
            });
            await store.recordObservation({
                sessionId: 's1',
                timestamp: 2,
                toolName: 'Read',
                event: 'file:read',
            });
            await store.recordObservation({
                sessionId: 's1',
                timestamp: 3,
                toolName: 'Edit',
                event: 'file:edit',
            });

            const counts = await store.getToolCounts('s1');
            expect(counts['Read']).toBe(2);
            expect(counts['Edit']).toBe(1);
        });

        it('returns empty object for session with no observations', async () => {
            await store.startSession('s1', 1000);
            const counts = await store.getToolCounts('s1');
            expect(counts).toEqual({});
        });
    });

    describe('getHotspots', () => {
        it('returns files edited at or above the threshold', async () => {
            await store.startSession('s1', 1000);
            for (let i = 0; i < 3; i++) {
                await store.recordObservation({
                    sessionId: 's1',
                    timestamp: 1000 + i,
                    toolName: 'Edit',
                    event: 'file:edit',
                    filePath: 'src/hot.ts',
                });
            }
            await store.recordObservation({
                sessionId: 's1',
                timestamp: 2000,
                toolName: 'Edit',
                event: 'file:edit',
                filePath: 'src/cold.ts',
            });

            const hotspots = await store.getHotspots('s1', 3);
            expect(hotspots).toContain('src/hot.ts');
            expect(hotspots).not.toContain('src/cold.ts');
        });

        it('excludes non-edit events', async () => {
            await store.startSession('s1', 1000);
            for (let i = 0; i < 5; i++) {
                await store.recordObservation({
                    sessionId: 's1',
                    timestamp: 1000 + i,
                    toolName: 'Read',
                    event: 'file:read',
                    filePath: 'src/read-only.ts',
                });
            }

            const hotspots = await store.getHotspots('s1', 3);
            expect(hotspots).not.toContain('src/read-only.ts');
        });

        it('returns empty array when no files meet threshold', async () => {
            await store.startSession('s1', 1000);
            await store.recordObservation({
                sessionId: 's1',
                timestamp: 1000,
                toolName: 'Edit',
                event: 'file:edit',
                filePath: 'src/a.ts',
            });

            const hotspots = await store.getHotspots('s1', 5);
            expect(hotspots).toHaveLength(0);
        });
    });

    describe('saveSnapshot / getSnapshot', () => {
        it('saves and retrieves a snapshot', async () => {
            await store.startSession('s1', 1000);
            await store.saveSnapshot('s1', '{"state":"active"}');
            const snap = await store.getSnapshot('s1');
            expect(snap).toBe('{"state":"active"}');
        });

        it('updates an existing snapshot via upsert', async () => {
            await store.startSession('s1', 1000);
            await store.saveSnapshot('s1', '{"state":"active"}');
            await store.saveSnapshot('s1', '{"state":"done"}');
            const snap = await store.getSnapshot('s1');
            expect(snap).toBe('{"state":"done"}');
        });

        it('returns null for missing snapshot', async () => {
            const snap = await store.getSnapshot('nonexistent');
            expect(snap).toBeNull();
        });
    });

    describe('getSessionCount', () => {
        it('returns 0 when no sessions exist', async () => {
            const count = await store.getSessionCount();
            expect(count).toBe(0);
        });

        it('counts all sessions', async () => {
            await store.startSession('s1', 1000);
            await store.startSession('s2', 2000);
            await store.startSession('s3', 3000);
            const count = await store.getSessionCount();
            expect(count).toBe(3);
        });
    });
});
