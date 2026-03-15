import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DnaStorage } from '../../src/dna/storage.js';
import type { DnaEntry, DnaIndex } from '../../src/dna/types.js';

const FIXTURES = path.join(import.meta.dirname, '../fixtures/dna');

describe('DnaStorage', () => {
    let tmpDir: string;
    let storage: DnaStorage;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `synapse-dna-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        storage = new DnaStorage(tmpDir);
        storage.ensureDirectories();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('ensureDirectories', () => {
        it('creates category directories', () => {
            expect(fs.existsSync(path.join(tmpDir, 'style'))).toBe(true);
            expect(fs.existsSync(path.join(tmpDir, 'preferences'))).toBe(
                true
            );
            expect(fs.existsSync(path.join(tmpDir, 'anti-patterns'))).toBe(
                true
            );
            expect(fs.existsSync(path.join(tmpDir, 'decisions'))).toBe(true);
        });

        it('creates an empty index.json if none exists', () => {
            const indexPath = path.join(tmpDir, 'index.json');
            expect(fs.existsSync(indexPath)).toBe(true);
            const index: DnaIndex = JSON.parse(
                fs.readFileSync(indexPath, 'utf-8')
            );
            expect(index.version).toBe(1);
            expect(index.entries).toEqual([]);
        });
    });

    describe('readIndex', () => {
        it('reads the index from disk', () => {
            const index = storage.readIndex();
            expect(index.version).toBe(1);
            expect(index.entries).toEqual([]);
        });
    });

    describe('readFromFixtures', () => {
        it('reads entries from fixture directory', () => {
            const fixtureStorage = new DnaStorage(FIXTURES);
            const index = fixtureStorage.readIndex();
            expect(index.entries).toHaveLength(2);
        });

        it('reads a specific entry by id', () => {
            const fixtureStorage = new DnaStorage(FIXTURES);
            const entry = fixtureStorage.readEntry('style-early-returns');
            expect(entry).toBeDefined();
            expect(entry!.frontmatter.id).toBe('style-early-returns');
            expect(entry!.frontmatter.confidence).toBe(0.95);
            expect(entry!.content).toContain('early returns');
        });

        it('returns null for non-existent entry', () => {
            const fixtureStorage = new DnaStorage(FIXTURES);
            const entry = fixtureStorage.readEntry('non-existent-id');
            expect(entry).toBeNull();
        });
    });

    describe('writeEntry', () => {
        it('writes a new entry and updates the index', () => {
            const entry: DnaEntry = {
                frontmatter: {
                    id: 'style-no-nested-ternaries',
                    confidence: 0.3,
                    source: 'correction',
                    status: 'suggested',
                    category: 'style',
                    firstSeen: '2026-03-16',
                    lastSeen: '2026-03-16',
                    occurrences: 1,
                    sessionIds: ['session-5'],
                },
                content:
                    'Avoid nested ternary expressions. Use if/else or early returns instead.',
            };

            storage.writeEntry(entry);

            const readBack = storage.readEntry('style-no-nested-ternaries');
            expect(readBack).toBeDefined();
            expect(readBack!.frontmatter.id).toBe(
                'style-no-nested-ternaries'
            );
            expect(readBack!.content).toContain('nested ternary');

            const index = storage.readIndex();
            expect(index.entries).toHaveLength(1);
            expect(index.entries[0].id).toBe('style-no-nested-ternaries');
        });

        it('overwrites an existing entry', () => {
            const entry: DnaEntry = {
                frontmatter: {
                    id: 'style-test-overwrite',
                    confidence: 0.3,
                    source: 'correction',
                    status: 'suggested',
                    category: 'style',
                    firstSeen: '2026-03-16',
                    lastSeen: '2026-03-16',
                    occurrences: 1,
                    sessionIds: ['session-5'],
                },
                content: 'Original content.',
            };

            storage.writeEntry(entry);

            const updated: DnaEntry = {
                ...entry,
                frontmatter: {
                    ...entry.frontmatter,
                    confidence: 0.8,
                    occurrences: 5,
                },
                content: 'Updated content.',
            };

            storage.writeEntry(updated);

            const readBack = storage.readEntry('style-test-overwrite');
            expect(readBack!.frontmatter.confidence).toBe(0.8);
            expect(readBack!.content).toBe('Updated content.');

            const index = storage.readIndex();
            expect(index.entries).toHaveLength(1);
        });
    });

    describe('deleteEntry', () => {
        it('removes an entry and updates the index', () => {
            const entry: DnaEntry = {
                frontmatter: {
                    id: 'style-delete-me',
                    confidence: 0.3,
                    source: 'correction',
                    status: 'suggested',
                    category: 'style',
                    firstSeen: '2026-03-16',
                    lastSeen: '2026-03-16',
                    occurrences: 1,
                    sessionIds: [],
                },
                content: 'To be deleted.',
            };

            storage.writeEntry(entry);
            expect(storage.readEntry('style-delete-me')).toBeDefined();

            storage.deleteEntry('style-delete-me');
            expect(storage.readEntry('style-delete-me')).toBeNull();

            const index = storage.readIndex();
            expect(index.entries).toHaveLength(0);
        });

        it('does nothing for non-existent entry', () => {
            expect(() => storage.deleteEntry('non-existent')).not.toThrow();
        });
    });

    describe('listEntries', () => {
        it('returns all entries', () => {
            const entry1: DnaEntry = {
                frontmatter: {
                    id: 'style-a',
                    confidence: 0.3,
                    source: 'correction',
                    status: 'suggested',
                    category: 'style',
                    firstSeen: '2026-03-16',
                    lastSeen: '2026-03-16',
                    occurrences: 1,
                    sessionIds: [],
                },
                content: 'Entry A.',
            };

            const entry2: DnaEntry = {
                frontmatter: {
                    id: 'preferences-b',
                    confidence: 0.8,
                    source: 'explicit',
                    status: 'approved',
                    category: 'preferences',
                    firstSeen: '2026-03-10',
                    lastSeen: '2026-03-16',
                    occurrences: 5,
                    sessionIds: [],
                },
                content: 'Entry B.',
            };

            storage.writeEntry(entry1);
            storage.writeEntry(entry2);

            const all = storage.listEntries();
            expect(all).toHaveLength(2);
        });

        it('filters by status', () => {
            const entry1: DnaEntry = {
                frontmatter: {
                    id: 'style-a',
                    confidence: 0.3,
                    source: 'correction',
                    status: 'suggested',
                    category: 'style',
                    firstSeen: '2026-03-16',
                    lastSeen: '2026-03-16',
                    occurrences: 1,
                    sessionIds: [],
                },
                content: 'Suggested entry.',
            };

            const entry2: DnaEntry = {
                frontmatter: {
                    id: 'style-b',
                    confidence: 0.9,
                    source: 'correction',
                    status: 'approved',
                    category: 'style',
                    firstSeen: '2026-03-10',
                    lastSeen: '2026-03-16',
                    occurrences: 10,
                    sessionIds: [],
                },
                content: 'Approved entry.',
            };

            storage.writeEntry(entry1);
            storage.writeEntry(entry2);

            const suggested = storage.listEntries({ status: 'suggested' });
            expect(suggested).toHaveLength(1);
            expect(suggested[0].frontmatter.id).toBe('style-a');

            const approved = storage.listEntries({ status: 'approved' });
            expect(approved).toHaveLength(1);
            expect(approved[0].frontmatter.id).toBe('style-b');
        });

        it('filters by category', () => {
            const entry1: DnaEntry = {
                frontmatter: {
                    id: 'style-a',
                    confidence: 0.3,
                    source: 'correction',
                    status: 'suggested',
                    category: 'style',
                    firstSeen: '2026-03-16',
                    lastSeen: '2026-03-16',
                    occurrences: 1,
                    sessionIds: [],
                },
                content: 'Style entry.',
            };

            const entry2: DnaEntry = {
                frontmatter: {
                    id: 'preferences-b',
                    confidence: 0.8,
                    source: 'explicit',
                    status: 'approved',
                    category: 'preferences',
                    firstSeen: '2026-03-10',
                    lastSeen: '2026-03-16',
                    occurrences: 5,
                    sessionIds: [],
                },
                content: 'Preference entry.',
            };

            storage.writeEntry(entry1);
            storage.writeEntry(entry2);

            const styleOnly = storage.listEntries({ category: 'style' });
            expect(styleOnly).toHaveLength(1);
            expect(styleOnly[0].frontmatter.id).toBe('style-a');
        });
    });
});
