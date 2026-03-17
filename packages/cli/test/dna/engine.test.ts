import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DnaEngine } from '#dna/engine.js';
import { DnaStorage } from '#dna/storage.js';

describe('DnaEngine', () => {
    let tmpDir: string;
    let storage: DnaStorage;
    let engine: DnaEngine;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `symbiote-engine-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        storage = new DnaStorage(tmpDir);
        storage.ensureDirectories();
        engine = new DnaEngine(storage);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('classifyCategory', () => {
        it('classifies anti-pattern instructions', () => {
            expect(DnaEngine.classifyCategory('Never use nested ternaries')).toBe('anti-patterns');
            expect(DnaEngine.classifyCategory("Don't use var, use const")).toBe('anti-patterns');
            expect(DnaEngine.classifyCategory('Avoid inline styles')).toBe('anti-patterns');
        });

        it('classifies preference instructions', () => {
            expect(DnaEngine.classifyCategory('Use Drizzle instead of Prisma')).toBe('preferences');
            expect(DnaEngine.classifyCategory('Prefer server actions over API routes')).toBe(
                'preferences',
            );
        });

        it('classifies style instructions', () => {
            expect(DnaEngine.classifyCategory('Use early returns in functions')).toBe('style');
            expect(DnaEngine.classifyCategory('Name components with PascalCase')).toBe('style');
        });

        it('classifies decision instructions', () => {
            expect(
                DnaEngine.classifyCategory('We chose Drizzle because of TypeScript inference'),
            ).toBe('decisions');
            expect(
                DnaEngine.classifyCategory('The reason we use server components is performance'),
            ).toBe('decisions');
        });
    });

    describe('generateId', () => {
        it('generates a slug from content', () => {
            const id = DnaEngine.generateId('style', 'Use early returns in functions');
            expect(id).toBe('style-use-early-returns-in-functions');
        });

        it('truncates long content', () => {
            const id = DnaEngine.generateId(
                'style',
                'This is a very long instruction that should be truncated to a reasonable length for use as a file name and identifier',
            );
            expect(id.length).toBeLessThanOrEqual(60);
        });

        it('removes special characters', () => {
            const id = DnaEngine.generateId('style', "Don't use var! Use const/let.");
            expect(id).toMatch(/^[a-z0-9-]+$/);
        });
    });

    describe('captureInstruction', () => {
        it('creates a new suggested entry from a correction', () => {
            const entry = engine.captureInstruction(
                'Use early returns instead of nesting',
                'session-1',
                'correction',
            );

            expect(entry).toBeDefined();
            expect(entry.frontmatter.status).toBe('suggested');
            expect(entry.frontmatter.confidence).toBe(0.3);
            expect(entry.frontmatter.source).toBe('correction');
            expect(entry.frontmatter.occurrences).toBe(1);
            expect(entry.frontmatter.sessionIds).toContain('session-1');

            const readBack = storage.readEntry(entry.frontmatter.id);
            expect(readBack).toBeDefined();
        });

        it('creates an approved entry from an explicit instruction', () => {
            const entry = engine.captureInstruction(
                'Always use TypeScript strict mode',
                'session-1',
                'explicit',
            );

            expect(entry.frontmatter.status).toBe('approved');
            expect(entry.frontmatter.confidence).toBe(1.0);
            expect(entry.frontmatter.source).toBe('explicit');
        });

        it('increments occurrences when capturing the same instruction again', () => {
            engine.captureInstruction('Use early returns', 'session-1', 'correction');
            const entry = engine.captureInstruction('Use early returns', 'session-2', 'correction');

            expect(entry.frontmatter.occurrences).toBe(2);
            expect(entry.frontmatter.sessionIds).toContain('session-1');
            expect(entry.frontmatter.sessionIds).toContain('session-2');
        });
    });

    describe('confidence scoring', () => {
        it('starts at 0.3 for a single correction', () => {
            const entry = engine.captureInstruction('Use const', 's1', 'correction');
            expect(entry.frontmatter.confidence).toBe(0.3);
        });

        it('is 1.0 for explicit instructions', () => {
            const entry = engine.captureInstruction('Always use const', 's1', 'explicit');
            expect(entry.frontmatter.confidence).toBe(1.0);
        });

        it('increases with each unique session', () => {
            engine.captureInstruction('Use const over let', 'session-1', 'correction');
            const entry2 = engine.captureInstruction(
                'Use const over let',
                'session-2',
                'correction',
            );

            expect(entry2.frontmatter.confidence).toBeGreaterThan(0.3);
        });

        it('auto-promotes to approved at 3+ unique sessions', () => {
            engine.captureInstruction('Use const over let', 'session-1', 'correction');
            engine.captureInstruction('Use const over let', 'session-2', 'correction');
            const entry = engine.captureInstruction(
                'Use const over let',
                'session-3',
                'correction',
            );

            expect(entry.frontmatter.status).toBe('approved');
            expect(entry.frontmatter.confidence).toBeGreaterThanOrEqual(0.8);
        });

        it('does not count duplicate sessions', () => {
            engine.captureInstruction('Use const over let', 'session-1', 'correction');
            engine.captureInstruction('Use const over let', 'session-1', 'correction');
            const entry = engine.captureInstruction(
                'Use const over let',
                'session-1',
                'correction',
            );

            expect(entry.frontmatter.sessionIds).toEqual(['session-1']);
            expect(entry.frontmatter.confidence).toBe(0.3);
        });
    });

    describe('approveEntry / rejectEntry', () => {
        it('approves a suggested entry', () => {
            const created = engine.captureInstruction('Use early returns', 's1', 'correction');
            const approved = engine.approveEntry(created.frontmatter.id);

            expect(approved).toBeDefined();
            expect(approved!.frontmatter.status).toBe('approved');
            expect(approved!.frontmatter.confidence).toBe(1.0);
        });

        it('rejects a suggested entry', () => {
            const created = engine.captureInstruction('Use var always', 's1', 'correction');
            const rejected = engine.rejectEntry(created.frontmatter.id);

            expect(rejected).toBeDefined();
            expect(rejected!.frontmatter.status).toBe('rejected');
        });

        it('returns null for non-existent entry', () => {
            expect(engine.approveEntry('non-existent')).toBeNull();
            expect(engine.rejectEntry('non-existent')).toBeNull();
        });
    });

    describe('editEntry', () => {
        it('updates the content of an entry', () => {
            const created = engine.captureInstruction('Use early returns', 's1', 'correction');
            const edited = engine.editEntry(
                created.frontmatter.id,
                'Use early returns to exit functions immediately. Never nest logic inside else blocks.',
            );

            expect(edited).toBeDefined();
            expect(edited!.content).toContain('immediately');
        });
    });

    describe('getActiveEntries', () => {
        it('returns only approved and suggested entries (not rejected)', () => {
            engine.captureInstruction('Use early returns', 's1', 'correction');
            engine.captureInstruction('Always use TypeScript', 's1', 'explicit');
            const rejected = engine.captureInstruction('Use var', 's1', 'correction');
            engine.rejectEntry(rejected.frontmatter.id);

            const active = engine.getActiveEntries();
            expect(active).toHaveLength(2);
            expect(active.every((e) => e.frontmatter.status !== 'rejected')).toBe(true);
        });
    });
});
