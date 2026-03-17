import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { IntentStore, type IntentEntry } from '#brain/intent.js';

const FIXTURES = path.join(import.meta.dirname, '../fixtures/brain-project/.brain');

describe('IntentStore', () => {
    describe('reading from fixtures', () => {
        let store: IntentStore;

        beforeEach(() => {
            store = new IntentStore(FIXTURES);
        });

        it('lists all decisions', async () => {
            const decisions = await store.listEntries('decision');
            expect(decisions.length).toBeGreaterThanOrEqual(1);
            expect(decisions[0].frontmatter.type).toBe('decision');
        });

        it('lists all constraints', async () => {
            const constraints = await store.listEntries('constraint');
            expect(constraints.length).toBeGreaterThanOrEqual(1);
            expect(constraints[0].frontmatter.type).toBe('constraint');
        });

        it('reads a specific entry by id', async () => {
            const entry = await store.readEntry('constraint-no-raw-sql');
            expect(entry).toBeDefined();
            expect(entry!.frontmatter.id).toBe('constraint-no-raw-sql');
            expect(entry!.content).toContain('Drizzle ORM');
        });

        it('returns null for unknown id', async () => {
            const entry = await store.readEntry('nonexistent');
            expect(entry).toBeNull();
        });

        it('filters by scope', async () => {
            const global = await store.listEntries('constraint', {
                scope: 'global',
            });
            expect(global.length).toBeGreaterThanOrEqual(1);

            const scoped = await store.listEntries('constraint', {
                scope: 'src/service.ts',
            });
            expect(scoped.length).toBe(0);
        });
    });

    describe('writing', () => {
        let tmpDir: string;
        let store: IntentStore;

        beforeEach(() => {
            tmpDir = path.join(os.tmpdir(), `symbiote-intent-test-${Date.now()}`);
            fs.mkdirSync(path.join(tmpDir, 'intent', 'decisions'), {
                recursive: true,
            });
            fs.mkdirSync(path.join(tmpDir, 'intent', 'constraints'), {
                recursive: true,
            });
            store = new IntentStore(tmpDir);
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        it('writes a decision entry', async () => {
            const entry: IntentEntry = {
                frontmatter: {
                    id: 'decision-test',
                    type: 'decision',
                    scope: 'global',
                    status: 'proposed',
                    author: 'ai',
                    createdAt: '2026-03-16',
                },
                content: 'Use React Server Components for data fetching.',
            };

            store.writeEntry(entry);

            const read = await store.readEntry('decision-test');
            expect(read).toBeDefined();
            expect(read!.frontmatter.status).toBe('proposed');
            expect(read!.content).toContain('React Server Components');
        });

        it('writes a constraint entry', async () => {
            const entry: IntentEntry = {
                frontmatter: {
                    id: 'constraint-test',
                    type: 'constraint',
                    scope: 'src/api/',
                    status: 'proposed',
                    author: 'ai',
                    createdAt: '2026-03-16',
                },
                content: 'All API routes must use the withAuth wrapper.',
            };

            store.writeEntry(entry);

            const read = await store.readEntry('constraint-test');
            expect(read).toBeDefined();
            expect(read!.frontmatter.scope).toBe('src/api/');
        });

        it('overwrites an existing entry', async () => {
            const entry: IntentEntry = {
                frontmatter: {
                    id: 'decision-overwrite',
                    type: 'decision',
                    scope: 'global',
                    status: 'proposed',
                    author: 'ai',
                    createdAt: '2026-03-16',
                },
                content: 'Original content.',
            };

            store.writeEntry(entry);
            store.writeEntry({
                ...entry,
                content: 'Updated content.',
            });

            const read = await store.readEntry('decision-overwrite');
            expect(read!.content).toBe('Updated content.');
        });
    });
});
