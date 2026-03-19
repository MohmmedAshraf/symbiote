import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionStartHandler } from '#hooks/handlers/session-start.js';
import { SessionStore } from '#hooks/session-store.js';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import type { DnaEngine } from '#dna/engine.js';
import type { DnaEntry } from '#dna/types.js';
import type { ConstraintRef } from '#hooks/handlers/pre-tool-use.js';
import type { HealthEngine } from '#brain/health/index.js';
import type { HealthReport } from '#brain/health/index.js';

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

function makeHealthReport(overrides: Partial<HealthReport> = {}): HealthReport {
    return {
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
        ...overrides,
    };
}

function makeHealthEngine(report?: HealthReport): HealthEngine {
    return {
        analyze: vi.fn().mockResolvedValue(report ?? makeHealthReport()),
    } as unknown as HealthEngine;
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
            health: HealthEngine;
            cachedHealth: { report: HealthReport; timestamp: number } | null;
        }> = {},
    ): SessionStartHandler {
        const entries = overrides.dnaEntries ?? [];
        return new SessionStartHandler({
            dnaEngine: makeDnaEngine(entries),
            sessionStore,
            constraints: overrides.constraints ?? constraints,
            health: overrides.health ?? makeHealthEngine(),
            cachedHealth: overrides.cachedHealth !== undefined ? overrides.cachedHealth : null,
        });
    }

    describe('additionalContext content', () => {
        it('includes Symbiote active preamble', async () => {
            const handler = makeHandler();
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Symbiote is active');
        });

        it('includes tool discovery prompt', async () => {
            const handler = makeHandler();
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('search for Symbiote MCP tools');
        });

        it('formats DNA as prose not bullet list', async () => {
            const handler = makeHandler({
                dnaEntries: [
                    makeDnaEntry('use single quotes'),
                    makeDnaEntry('prefer const over let'),
                ],
            });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toMatch(/- \[style\]/);
            expect(ctx).toContain('Developer style:');
            expect(ctx).toContain('use single quotes');
            expect(ctx).toContain('prefer const over let');
        });

        it('includes global constraints as bulleted list', async () => {
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

        it('includes health alerts when circular deps exist', async () => {
            const report = makeHealthReport({
                circularDeps: [{ chain: ['a', 'b', 'a'], filePaths: ['a.ts', 'b.ts'] }],
            });
            const handler = makeHandler({ health: makeHealthEngine(report) });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Health alerts:');
            expect(ctx).toContain('circular dependenc');
        });

        it('includes health alerts when dead code exists', async () => {
            const report = makeHealthReport({
                deadCode: [
                    {
                        node: {
                            id: 'fn:unused',
                            type: 'function',
                            name: 'unusedFn',
                            filePath: 'src/util.ts',
                            lineStart: 1,
                            lineEnd: 5,
                            isExported: false,
                        },
                        reason: 'unreferenced',
                    },
                ],
            });
            const handler = makeHandler({ health: makeHealthEngine(report) });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Health alerts:');
            expect(ctx).toContain('dead function');
        });

        it('omits health alerts section when no issues', async () => {
            const handler = makeHandler({ health: makeHealthEngine(makeHealthReport()) });
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toContain('Health alerts:');
        });

        it('uses cached health when fresh (under 5 min)', async () => {
            const freshReport = makeHealthReport({
                circularDeps: [{ chain: ['x', 'y', 'x'], filePaths: ['x.ts', 'y.ts'] }],
            });
            const cachedHealth = { report: freshReport, timestamp: Date.now() };
            const healthEngine = makeHealthEngine();
            const handler = makeHandler({ health: healthEngine, cachedHealth });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            expect(healthEngine.analyze).not.toHaveBeenCalled();
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Health alerts:');
        });

        it('re-runs health analysis when cache is stale (over 5 min)', async () => {
            const staleReport = makeHealthReport();
            const staleTimestamp = Date.now() - 6 * 60 * 1000;
            const cachedHealth = { report: staleReport, timestamp: staleTimestamp };
            const freshReport = makeHealthReport({
                circularDeps: [{ chain: ['a', 'b', 'a'], filePaths: ['a.ts', 'b.ts'] }],
            });
            const healthEngine = makeHealthEngine(freshReport);
            const handler = makeHandler({ health: healthEngine, cachedHealth });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            expect(healthEngine.analyze).toHaveBeenCalled();
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Health alerts:');
        });

        it('includes record_instruction guidance', async () => {
            const handler = makeHandler();
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('record_instruction');
        });
    });

    describe('compact source', () => {
        it('shows session restored message with edited files', async () => {
            await sessionStore.saveSnapshot(
                'sess-1',
                JSON.stringify({
                    filesModified: ['src/auth.ts', 'src/db.ts'],
                    attention: ['src/auth.ts'],
                }),
            );

            const handler = makeHandler();
            const result = await handler.handle({ sessionId: 'sess-1', source: 'compact' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Session restored');
            expect(ctx).toContain('src/auth.ts');
            expect(ctx).toContain('src/db.ts');
        });

        it('shows focus area when attention is available', async () => {
            await sessionStore.saveSnapshot(
                'sess-1',
                JSON.stringify({
                    filesModified: ['src/auth.ts'],
                    attention: ['src/auth.ts', 'src/db.ts'],
                }),
            );

            const handler = makeHandler();
            const result = await handler.handle({ sessionId: 'sess-1', source: 'compact' });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Focus area:');
        });

        it('handles missing snapshot gracefully', async () => {
            const handler = makeHandler();
            const result = await handler.handle({ sessionId: 'no-snapshot', source: 'compact' });

            expect(result.hookSpecificOutput?.hookEventName).toBe('SessionStart');
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Session restored');
        });
    });

    describe('empty DNA and constraints', () => {
        it('omits Developer style line when DNA is empty', async () => {
            const handler = makeHandler({ dnaEntries: [] });
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toContain('Developer style:');
        });

        it('omits Constraints section when constraints are empty', async () => {
            const handler = makeHandler({ constraints: [] });
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toContain('Constraints:');
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
                health: makeHealthEngine(),
                cachedHealth: null,
            });

            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            expect(result).toEqual({});
        });

        it('does not break when health analysis fails', async () => {
            const failingHealth = {
                analyze: vi.fn().mockRejectedValue(new Error('health failed')),
            } as unknown as HealthEngine;

            const handler = makeHandler({ health: failingHealth, cachedHealth: null });
            const result = await handler.handle({ sessionId: 'sess-1', source: 'startup' });

            expect(result.hookSpecificOutput?.hookEventName).toBe('SessionStart');
            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toContain('Health alerts:');
        });
    });
});
