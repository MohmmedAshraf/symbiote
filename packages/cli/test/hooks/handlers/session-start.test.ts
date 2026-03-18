import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionStartHandler } from '#hooks/handlers/session-start.js';
import { SessionStore } from '#hooks/session-store.js';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import type { DnaEngine } from '#dna/engine.js';
import type { DnaEntry } from '#dna/types.js';
import type { ConstraintRef } from '#hooks/handlers/pre-tool-use.js';

function makeDnaEntry(content: string): DnaEntry {
    return {
        frontmatter: {
            id: content.slice(0, 10),
            confidence: 0.8,
            source: 'explicit',
            status: 'approved',
            category: 'style',
            firstSeen: '2026-01-01',
            lastSeen: '2026-01-01',
            occurrences: 1,
            sessionIds: [],
        },
        content,
    };
}

function makeDnaEngine(entries: DnaEntry[] = []): DnaEngine {
    return {
        getActiveEntries: vi.fn().mockReturnValue(entries),
    } as unknown as DnaEngine;
}

describe('SessionStartHandler', () => {
    let db: SymbioteDB;
    let sessionStore: SessionStore;
    let dnaEngine: DnaEngine;
    let constraints: ConstraintRef[];

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        sessionStore = new SessionStore(db);
        constraints = [];
        dnaEngine = makeDnaEngine();
    });

    afterEach(async () => {
        await db.close();
    });

    function makeHandler(
        overrides: Partial<{
            dnaEntries: DnaEntry[];
            constraints: ConstraintRef[];
            projectName: string;
            fileCount: number;
        }> = {},
    ): SessionStartHandler {
        const entries = overrides.dnaEntries ?? [];
        return new SessionStartHandler({
            dnaEngine: makeDnaEngine(entries),
            sessionStore,
            constraints: overrides.constraints ?? constraints,
            projectName: overrides.projectName ?? 'my-project',
            fileCount: overrides.fileCount ?? 42,
        });
    }

    describe('additionalContext content', () => {
        it('includes project name and file count', async () => {
            const handler = makeHandler({ projectName: 'synapse', fileCount: 100 });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            expect(result.hookSpecificOutput?.additionalContext).toContain(
                '[Symbiote] Project: synapse',
            );
            expect(result.hookSpecificOutput?.additionalContext).toContain('100 files');
        });

        it('includes DNA rules as comma-separated list', async () => {
            const handler = makeHandler({
                dnaEntries: [
                    makeDnaEntry('use single quotes'),
                    makeDnaEntry('prefer const over let'),
                ],
            });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('DNA:');
            expect(ctx).toContain('use single quotes');
            expect(ctx).toContain('prefer const over let');
        });

        it('includes global constraints', async () => {
            const handler = makeHandler({
                constraints: [
                    { scope: 'global', content: 'No comments in code' },
                    { scope: 'src/', content: 'Use strict types' },
                ],
            });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Constraints:');
            expect(ctx).toContain('No comments in code');
            expect(ctx).not.toContain('Use strict types');
        });

        it('includes wildcard constraints', async () => {
            const handler = makeHandler({
                constraints: [{ scope: '*', content: 'Always use TypeScript' }],
            });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Always use TypeScript');
        });
    });

    describe('compact source', () => {
        it('includes snapshot data when source is compact', async () => {
            await sessionStore.saveSnapshot(
                'sess-1',
                JSON.stringify({
                    filesModified: ['src/auth.ts', 'src/db.ts'],
                    attention: ['auth', 'database'],
                }),
            );

            const handler = makeHandler();
            const result = await handler.handle({ sessionId: 'sess-1', source: 'compact' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Files modified this session: src/auth.ts, src/db.ts');
            expect(ctx).toContain('Active attention: auth, database');
        });

        it('handles missing snapshot gracefully', async () => {
            const handler = makeHandler();
            const result = await handler.handle({ sessionId: 'no-snapshot', source: 'compact' });

            expect(result.hookSpecificOutput?.hookEventName).toBe('SessionStart');
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toContain('Files modified');
            expect(ctx).not.toContain('Active attention');
        });
    });

    describe('empty DNA and constraints', () => {
        it('handles empty DNA gracefully', async () => {
            const handler = makeHandler({ dnaEntries: [] });
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toContain('DNA:');
            expect(result.hookSpecificOutput?.hookEventName).toBe('SessionStart');
        });

        it('handles empty constraints gracefully', async () => {
            const handler = makeHandler({ constraints: [] });
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toContain('Constraints:');
        });

        it('still returns project info when DNA and constraints are empty', async () => {
            const handler = makeHandler({
                dnaEntries: [],
                constraints: [],
                projectName: 'myapp',
                fileCount: 5,
            });
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('[Symbiote] Project: myapp');
            expect(ctx).toContain('5 files');
        });
    });

    describe('hookEventName', () => {
        it('sets hookEventName to SessionStart', async () => {
            const handler = makeHandler();
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            expect(result.hookSpecificOutput?.hookEventName).toBe('SessionStart');
        });
    });

    describe('error resilience', () => {
        it('returns empty response when handler throws', async () => {
            const brokenEngine = {
                getActiveEntries: vi.fn().mockImplementation(() => {
                    throw new Error('dna broken');
                }),
            } as unknown as DnaEngine;

            const handler = new SessionStartHandler({
                dnaEngine: brokenEngine,
                sessionStore,
                constraints: [],
                projectName: 'test',
                fileCount: 0,
            });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            expect(result).toEqual({});
        });
    });
});
