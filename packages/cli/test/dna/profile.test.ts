import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ProfileStorage } from '#dna/profile.js';
import type { DnaEntry } from '#dna/schema.js';
import { DnaEntrySchema } from '#dna/schema.js';

function makeEntry(overrides: Partial<DnaEntry> & { id: string; rule: string }): DnaEntry {
    return DnaEntrySchema.parse(overrides);
}

describe('ProfileStorage', () => {
    let tmpDir: string;
    let storage: ProfileStorage;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `symbiote-profile-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        storage = new ProfileStorage(tmpDir);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('ensurePersonalProfile', () => {
        it('creates a default personal profile', () => {
            storage.ensurePersonalProfile('Mohamed Ashraf', 'MohmmedAshraf');

            const profile = storage.readProfile('personal');
            expect(profile).not.toBeNull();
            expect(profile!.version).toBe(1);
            expect(profile!.profile.name).toBe('Mohamed Ashraf');
            expect(profile!.profile.handle).toBe('MohmmedAshraf');
            expect(profile!.entries).toEqual([]);
            expect(profile!.stats.total_entries).toBe(0);
        });

        it('does not overwrite an existing personal profile', () => {
            storage.ensurePersonalProfile('Mohamed Ashraf', 'MohmmedAshraf');

            const entry = makeEntry({
                id: 'style-semicolons',
                rule: 'Always use semicolons',
                category: 'style',
            });
            storage.writeEntry(entry);

            storage.ensurePersonalProfile('Mohamed Ashraf', 'MohmmedAshraf');

            const profile = storage.readProfile('personal');
            expect(profile!.entries).toHaveLength(1);
        });
    });

    describe('readProfile / writeEntry', () => {
        it('reads and writes entries to active profile', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const entry = makeEntry({
                id: 'style-early-returns',
                rule: 'Use early returns instead of nested else blocks',
                category: 'style',
                applies_to: ['typescript'],
                confidence: 0.8,
            });

            storage.writeEntry(entry);

            const profile = storage.readProfile('personal');
            expect(profile).not.toBeNull();
            expect(profile!.entries).toHaveLength(1);
            expect(profile!.entries[0].id).toBe('style-early-returns');
            expect(profile!.entries[0].rule).toBe(
                'Use early returns instead of nested else blocks',
            );
            expect(profile!.stats.total_entries).toBe(1);
            expect(profile!.stats.categories).toContain('style');
        });

        it('replaces an existing entry by ID', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const entry = makeEntry({
                id: 'style-semicolons',
                rule: 'Always use semicolons',
                confidence: 0.3,
            });
            storage.writeEntry(entry);

            const updated = makeEntry({
                id: 'style-semicolons',
                rule: 'Always use semicolons at end of statements',
                confidence: 0.9,
                status: 'approved',
            });
            storage.writeEntry(updated);

            const profile = storage.readProfile('personal');
            expect(profile!.entries).toHaveLength(1);
            expect(profile!.entries[0].rule).toBe('Always use semicolons at end of statements');
            expect(profile!.entries[0].confidence).toBe(0.9);
        });
    });

    describe('readEntry / deleteEntry', () => {
        it('reads a single entry by ID', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const entry = makeEntry({
                id: 'pref-tabs',
                rule: 'Use tabs for indentation',
                category: 'style',
            });
            storage.writeEntry(entry);

            const found = storage.readEntry('pref-tabs');
            expect(found).not.toBeNull();
            expect(found!.id).toBe('pref-tabs');
            expect(found!.rule).toBe('Use tabs for indentation');
        });

        it('returns null for non-existent entry', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');
            expect(storage.readEntry('non-existent')).toBeNull();
        });

        it('deletes an entry by ID', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const entry = makeEntry({
                id: 'style-delete-me',
                rule: 'To be deleted',
            });
            storage.writeEntry(entry);
            expect(storage.readEntry('style-delete-me')).not.toBeNull();

            storage.deleteEntry('style-delete-me');
            expect(storage.readEntry('style-delete-me')).toBeNull();

            const profile = storage.readProfile('personal');
            expect(profile!.entries).toHaveLength(0);
            expect(profile!.stats.total_entries).toBe(0);
        });
    });

    describe('listProfiles', () => {
        it('lists all profiles', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');
            storage.saveProfile('work', {
                version: 1,
                profile: {
                    name: 'Work Profile',
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
            });

            const profiles = storage.listProfiles();
            expect(profiles).toContain('personal');
            expect(profiles).toContain('work');
            expect(profiles).toHaveLength(2);
        });

        it('returns empty list when no profiles exist', () => {
            expect(storage.listProfiles()).toEqual([]);
        });
    });

    describe('switchProfile', () => {
        it('switches active profile', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');
            storage.saveProfile('work', {
                version: 1,
                profile: {
                    name: 'Work',
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
            });

            storage.switchProfile('work');
            expect(storage.getActiveProfileName()).toBe('work');
        });

        it('throws when switching to non-existent profile', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');
            expect(() => storage.switchProfile('ghost')).toThrow();
        });
    });

    describe('reinforceEntry', () => {
        it('increments occurrences and sessions for a new session', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const entry = makeEntry({
                id: 'style-semicolons',
                rule: 'Always use semicolons',
                origin: { session_id: 'sess-1' },
            });
            storage.writeEntry(entry);

            storage.reinforceEntry('style-semicolons', 'sess-2');

            const reinforced = storage.readEntry('style-semicolons');
            expect(reinforced).not.toBeNull();
            expect(reinforced!.evidence.occurrences).toBe(2);
            expect(reinforced!.evidence.sessions).toBe(1);
        });

        it('increments occurrences but not sessions for the same session', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const entry = makeEntry({
                id: 'style-semicolons',
                rule: 'Always use semicolons',
                origin: { session_id: 'sess-1' },
            });
            storage.writeEntry(entry);

            storage.reinforceEntry('style-semicolons', 'sess-1');

            const reinforced = storage.readEntry('style-semicolons');
            expect(reinforced).not.toBeNull();
            expect(reinforced!.evidence.occurrences).toBe(2);
            expect(reinforced!.evidence.sessions).toBe(0);
        });

        it('updates last_seen date', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const entry = makeEntry({
                id: 'style-semicolons',
                rule: 'Always use semicolons',
                evidence: {
                    first_seen: '2026-01-01',
                    last_seen: '2026-01-01',
                    occurrences: 5,
                    sessions: 2,
                },
            });
            storage.writeEntry(entry);

            storage.reinforceEntry('style-semicolons', 'sess-new');

            const reinforced = storage.readEntry('style-semicolons');
            expect(reinforced!.evidence.last_seen).not.toBe('2026-01-01');
        });
    });

    describe('readActiveProfile fallback', () => {
        it('falls back to personal when active profile is missing', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const configPath = path.join(tmpDir, 'config.json');
            fs.writeFileSync(configPath, JSON.stringify({ active_profile: 'deleted' }));

            const profile = storage.readActiveProfile();
            expect(profile.profile.name).toBe('Test User');
        });

        it('falls back to personal when config.json is missing', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const configPath = path.join(tmpDir, 'config.json');
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
            }

            const profile = storage.readActiveProfile();
            expect(profile.profile.name).toBe('Test User');
        });
    });

    describe('computeStats', () => {
        it('computes categories and top_languages', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            storage.writeEntry(
                makeEntry({
                    id: 'style-a',
                    rule: 'Rule A',
                    category: 'style',
                    applies_to: ['typescript', 'javascript'],
                }),
            );
            storage.writeEntry(
                makeEntry({
                    id: 'pref-b',
                    rule: 'Rule B',
                    category: 'preferences',
                    applies_to: ['typescript', 'python'],
                }),
            );
            storage.writeEntry(
                makeEntry({
                    id: 'style-c',
                    rule: 'Rule C',
                    category: 'style',
                    applies_to: ['rust'],
                }),
            );

            const profile = storage.readProfile('personal');
            expect(profile!.stats.total_entries).toBe(3);
            expect(profile!.stats.categories).toContain('style');
            expect(profile!.stats.categories).toContain('preferences');
            expect(profile!.stats.top_languages[0]).toBe('typescript');
        });

        it('limits top_languages to 5', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            const langs = [
                'typescript',
                'javascript',
                'python',
                'rust',
                'go',
                'java',
                'ruby',
                'cpp',
            ];
            for (let i = 0; i < langs.length; i++) {
                storage.writeEntry(
                    makeEntry({
                        id: `entry-${i}`,
                        rule: `Rule ${i}`,
                        applies_to: [langs[i]],
                    }),
                );
            }

            const profile = storage.readProfile('personal');
            expect(profile!.stats.top_languages.length).toBeLessThanOrEqual(5);
        });

        it('computes oldest_entry from evidence dates', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            storage.writeEntry(
                makeEntry({
                    id: 'newer',
                    rule: 'Newer rule',
                    evidence: {
                        first_seen: '2026-03-15',
                        last_seen: '2026-03-21',
                        occurrences: 1,
                        sessions: 0,
                    },
                }),
            );
            storage.writeEntry(
                makeEntry({
                    id: 'older',
                    rule: 'Older rule',
                    evidence: {
                        first_seen: '2026-01-01',
                        last_seen: '2026-03-21',
                        occurrences: 1,
                        sessions: 0,
                    },
                }),
            );

            const profile = storage.readProfile('personal');
            expect(profile!.stats.oldest_entry).toBe('2026-01-01');
        });

        it('computes total_sessions from unique origin session IDs', () => {
            storage.ensurePersonalProfile('Test User', 'testuser');

            storage.writeEntry(
                makeEntry({
                    id: 'a',
                    rule: 'Rule A',
                    origin: { session_id: 'sess-1' },
                    evidence: {
                        first_seen: '2026-03-10',
                        last_seen: '2026-03-21',
                        occurrences: 3,
                        sessions: 2,
                    },
                }),
            );
            storage.writeEntry(
                makeEntry({
                    id: 'b',
                    rule: 'Rule B',
                    origin: { session_id: 'sess-2' },
                    evidence: {
                        first_seen: '2026-03-12',
                        last_seen: '2026-03-21',
                        occurrences: 1,
                        sessions: 1,
                    },
                }),
            );
            storage.writeEntry(
                makeEntry({
                    id: 'c',
                    rule: 'Rule C',
                    origin: { session_id: 'sess-1' },
                    evidence: {
                        first_seen: '2026-03-14',
                        last_seen: '2026-03-21',
                        occurrences: 2,
                        sessions: 1,
                    },
                }),
            );

            const profile = storage.readProfile('personal');
            expect(profile!.stats.total_sessions).toBe(2);
        });
    });
});
