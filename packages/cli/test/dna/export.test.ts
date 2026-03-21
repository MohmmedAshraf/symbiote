import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProfileStorage } from '#dna/profile.js';
import { exportProfile, importProfile, importFromUrl } from '#dna/export.js';
import type { DnaProfile } from '#dna/schema.js';
import { DnaEntrySchema } from '#dna/schema.js';
import type { DnaEntry } from '#dna/schema.js';

function makeEntry(overrides: Partial<DnaEntry> & { id: string; rule: string }): DnaEntry {
    return DnaEntrySchema.parse(overrides);
}

function makeProfile(overrides: Partial<DnaProfile> = {}): DnaProfile {
    return {
        version: 1,
        profile: {
            name: 'Test User',
            handle: 'testuser',
            bio: '',
            created: '2026-03-21',
            updated: '2026-03-21',
        },
        entries: [],
        stats: {
            total_entries: 0,
            categories: [],
            top_languages: [],
            oldest_entry: null,
            total_sessions: 0,
        },
        ...overrides,
    };
}

describe('exportProfile', () => {
    let tmpDir: string;
    let storage: ProfileStorage;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `symbiote-export-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        storage = new ProfileStorage(tmpDir);
        storage.ensurePersonalProfile('Test User', 'testuser');
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('strips session_id from origin', () => {
        storage.writeEntry(makeEntry({
            id: 'style-semi',
            rule: 'Use semicolons',
            origin: { session_id: 'sess-abc-123', file: '/home/user/project/src/app.ts' },
        }));

        const exported = exportProfile(storage);
        const entry = exported.entries.find((e) => e.id === 'style-semi');

        expect(entry).toBeDefined();
        expect(entry!.origin?.session_id).toBeUndefined();
    });

    it('truncates file paths to filename only', () => {
        storage.writeEntry(makeEntry({
            id: 'style-tabs',
            rule: 'Use tabs',
            origin: { file: '/home/user/project/src/deep/nested/component.tsx' },
        }));

        const exported = exportProfile(storage);
        const entry = exported.entries.find((e) => e.id === 'style-tabs');

        expect(entry!.origin?.file).toBe('component.tsx');
    });

    it('preserves all entry data except sensitive fields', () => {
        storage.writeEntry(makeEntry({
            id: 'style-returns',
            rule: 'Prefer early returns',
            reason: 'Reduces nesting',
            category: 'style',
            applies_to: ['typescript'],
            source: 'correction',
            status: 'approved',
            confidence: 0.85,
            evidence: {
                first_seen: '2026-01-15',
                last_seen: '2026-03-21',
                occurrences: 12,
                sessions: 4,
            },
            origin: {
                session_id: 'sess-secret',
                file: '/Users/me/project/utils.ts',
                context: 'refactoring pass',
            },
        }));

        const exported = exportProfile(storage);
        const entry = exported.entries.find((e) => e.id === 'style-returns')!;

        expect(entry.rule).toBe('Prefer early returns');
        expect(entry.reason).toBe('Reduces nesting');
        expect(entry.category).toBe('style');
        expect(entry.applies_to).toEqual(['typescript']);
        expect(entry.source).toBe('correction');
        expect(entry.status).toBe('approved');
        expect(entry.confidence).toBe(0.85);
        expect(entry.evidence.first_seen).toBe('2026-01-15');
        expect(entry.evidence.occurrences).toBe(12);
        expect(entry.origin?.context).toBe('refactoring pass');
        expect(entry.origin?.file).toBe('utils.ts');
        expect(entry.origin?.session_id).toBeUndefined();
    });

    it('returns a deep clone that does not mutate the original', () => {
        storage.writeEntry(makeEntry({
            id: 'style-x',
            rule: 'Rule X',
            origin: { session_id: 'sess-1', file: '/a/b/c.ts' },
        }));

        const exported = exportProfile(storage);
        const original = storage.readActiveProfile();

        expect(original.entries[0].origin?.session_id).toBe('sess-1');
        expect(original.entries[0].origin?.file).toBe('/a/b/c.ts');

        exported.entries[0].rule = 'MUTATED';
        const reread = storage.readActiveProfile();
        expect(reread.entries[0].rule).toBe('Rule X');
    });
});

describe('importProfile', () => {
    let tmpDir: string;
    let storage: ProfileStorage;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `symbiote-import-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        storage = new ProfileStorage(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('validates and saves a valid profile', () => {
        const profile = makeProfile({
            entries: [
                makeEntry({ id: 'e1', rule: 'Rule 1', category: 'style' }),
                makeEntry({ id: 'e2', rule: 'Rule 2', category: 'preferences' }),
            ],
            stats: {
                total_entries: 2,
                categories: ['style', 'preferences'],
                top_languages: [],
                oldest_entry: null,
                total_sessions: 0,
            },
        });

        const result = importProfile(storage, JSON.stringify(profile));

        expect(result.name).toBe('testuser');
        expect(result.entryCount).toBe(2);

        const saved = storage.readProfile('testuser');
        expect(saved).not.toBeNull();
        expect(saved!.entries).toHaveLength(2);
    });

    it('derives name from handle with lowercase and dashes only', () => {
        const profile = makeProfile();
        profile.profile.handle = 'Mohamed_Ashraf 123!';

        const result = importProfile(storage, JSON.stringify(profile));
        expect(result.name).toBe('mohamed-ashraf-123');
    });

    it('rejects files exceeding 1MB', () => {
        const oversized = 'x'.repeat(1024 * 1024 + 1);
        expect(() => importProfile(storage, oversized)).toThrow(/exceeds maximum/i);
    });

    it('rejects invalid JSON', () => {
        expect(() => importProfile(storage, '{not valid json')).toThrow();
    });

    it('rejects profile with wrong schema', () => {
        const invalid = { version: 99, garbage: true };
        expect(() => importProfile(storage, JSON.stringify(invalid))).toThrow();
    });
});

describe('importFromUrl', () => {
    let tmpDir: string;
    let storage: ProfileStorage;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `symbiote-url-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        storage = new ProfileStorage(tmpDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('fetches and imports a profile from a URL', async () => {
        const profile = makeProfile({
            entries: [makeEntry({ id: 'url-1', rule: 'Fetched rule' })],
            stats: {
                total_entries: 1,
                categories: ['general'],
                top_languages: [],
                oldest_entry: null,
                total_sessions: 0,
            },
        });

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(JSON.stringify(profile)),
        }));

        const result = await importFromUrl(storage, 'https://example.com/profile.dna.json');

        expect(result.name).toBe('testuser');
        expect(result.entryCount).toBe(1);
    });

    it('throws when fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        }));

        await expect(
            importFromUrl(storage, 'https://example.com/missing.json'),
        ).rejects.toThrow(/failed to fetch/i);
    });
});
