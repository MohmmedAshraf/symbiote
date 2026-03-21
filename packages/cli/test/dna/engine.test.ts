import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DnaEngine } from '#dna/engine.js';
import { ProfileStorage } from '#dna/profile.js';
import type { DnaEntry } from '#dna/schema.js';

describe('DnaEngine (v2 — ProfileStorage)', () => {
    let tmpDir: string;
    let storage: ProfileStorage;
    let engine: DnaEngine;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `symbiote-engine-v2-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        storage = new ProfileStorage(tmpDir);
        storage.ensurePersonalProfile('Test User', 'testuser');
        engine = new DnaEngine(storage);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('captureInstruction', () => {
        it('captures explicit instruction with full confidence and approved status', () => {
            const entry = engine.captureInstruction({
                rule: 'Always use semicolons',
                source: 'explicit',
                sessionId: 'sess-1',
            });

            expect(entry.confidence).toBe(1.0);
            expect(entry.status).toBe('approved');
            expect(entry.source).toBe('explicit');
            expect(entry.rule).toBe('Always use semicolons');
            expect(entry.evidence.occurrences).toBe(1);
            expect(entry.evidence.sessions).toBe(1);
            expect(entry.origin?.session_id).toBe('sess-1');

            const stored = storage.readEntry(entry.id);
            expect(stored).not.toBeNull();
            expect(stored!.rule).toBe('Always use semicolons');
        });

        it('captures correction with base confidence and suggested status', () => {
            const entry = engine.captureInstruction({
                rule: 'Use early returns instead of nesting',
                source: 'correction',
                sessionId: 'sess-1',
            });

            expect(entry.confidence).toBe(0.3);
            expect(entry.status).toBe('suggested');
            expect(entry.source).toBe('correction');
        });

        it('captures observed pattern with base confidence and suggested status', () => {
            const entry = engine.captureInstruction({
                rule: 'Prefers const over let',
                source: 'observed',
                sessionId: 'sess-1',
            });

            expect(entry.confidence).toBe(0.3);
            expect(entry.status).toBe('suggested');
            expect(entry.source).toBe('observed');
        });

        it('reinforces existing entry on duplicate (same ID)', () => {
            const first = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            const second = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-2',
            });

            expect(second.id).toBe(first.id);
            expect(second.evidence.occurrences).toBe(2);
            expect(second.evidence.sessions).toBe(2);
            expect(second.confidence).toBeGreaterThan(0.3);
        });

        it('does not double-count same session on reinforce', () => {
            engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            const second = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            expect(second.evidence.occurrences).toBe(2);
            expect(second.evidence.sessions).toBe(1);
            expect(second.confidence).toBe(0.3);
        });

        it('captures rich fields (reason, applies_to, origin with file/context)', () => {
            const entry = engine.captureInstruction({
                rule: 'Use 4-space indentation',
                reason: 'Team convention',
                category: 'style',
                applies_to: ['typescript', 'javascript'],
                not_for: ['python'],
                source: 'explicit',
                sessionId: 'sess-1',
                file: 'src/index.ts',
                context: 'Code review feedback',
            });

            expect(entry.reason).toBe('Team convention');
            expect(entry.applies_to).toEqual(['typescript', 'javascript']);
            expect(entry.not_for).toEqual(['python']);
            expect(entry.category).toBe('style');
            expect(entry.origin?.file).toBe('src/index.ts');
            expect(entry.origin?.context).toBe('Code review feedback');
            expect(entry.origin?.session_id).toBe('sess-1');
        });

        it('auto-classifies category when not provided', () => {
            const entry = engine.captureInstruction({
                rule: 'Never use var declarations',
                source: 'correction',
                sessionId: 'sess-1',
            });

            expect(entry.category).toBe('anti-patterns');
        });

        it('promotes to explicit on re-capture with explicit source', () => {
            const first = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });
            expect(first.status).toBe('suggested');

            const second = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'explicit',
                sessionId: 'sess-2',
            });

            expect(second.status).toBe('approved');
            expect(second.confidence).toBe(1.0);
            expect(second.source).toBe('explicit');
        });
    });

    describe('approveEntry / rejectEntry', () => {
        it('approves a suggested entry', () => {
            const created = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            const approved = engine.approveEntry(created.id);
            expect(approved).not.toBeNull();
            expect(approved!.status).toBe('approved');
            expect(approved!.confidence).toBe(1.0);
        });

        it('rejects a suggested entry', () => {
            const created = engine.captureInstruction({
                rule: 'Use var always',
                source: 'correction',
                sessionId: 'sess-1',
            });

            const rejected = engine.rejectEntry(created.id);
            expect(rejected).not.toBeNull();
            expect(rejected!.status).toBe('rejected');
        });

        it('returns null for non-existent entry', () => {
            expect(engine.approveEntry('non-existent')).toBeNull();
            expect(engine.rejectEntry('non-existent')).toBeNull();
        });
    });

    describe('editEntry', () => {
        it('updates rule, reason, and applies_to', () => {
            const created = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            const edited = engine.editEntry(created.id, {
                rule: 'Always use early returns to reduce nesting',
                reason: 'Improves readability',
                applies_to: ['typescript'],
            });

            expect(edited).not.toBeNull();
            expect(edited!.rule).toBe('Always use early returns to reduce nesting');
            expect(edited!.reason).toBe('Improves readability');
            expect(edited!.applies_to).toEqual(['typescript']);
        });

        it('partially updates only provided fields', () => {
            const created = engine.captureInstruction({
                rule: 'Use early returns',
                reason: 'Original reason',
                source: 'explicit',
                sessionId: 'sess-1',
            });

            const edited = engine.editEntry(created.id, {
                reason: 'Updated reason',
            });

            expect(edited).not.toBeNull();
            expect(edited!.rule).toBe('Use early returns');
            expect(edited!.reason).toBe('Updated reason');
        });

        it('returns null for non-existent entry', () => {
            expect(engine.editEntry('non-existent', { rule: 'foo' })).toBeNull();
        });
    });

    describe('getActiveEntries', () => {
        it('returns active entries excluding rejected', () => {
            engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });
            engine.captureInstruction({
                rule: 'Always use TypeScript strict mode',
                source: 'explicit',
                sessionId: 'sess-1',
            });
            const rejected = engine.captureInstruction({
                rule: 'Use var',
                source: 'correction',
                sessionId: 'sess-1',
            });
            engine.rejectEntry(rejected.id);

            const active = engine.getActiveEntries();
            expect(active).toHaveLength(2);
            expect(active.every((e) => e.status !== 'rejected')).toBe(true);
        });
    });

    describe('autoPromote', () => {
        it('auto-promotes after 3 sessions at >=0.7 confidence', () => {
            engine.captureInstruction({
                rule: 'Use const over let',
                source: 'correction',
                sessionId: 'sess-1',
            });
            engine.captureInstruction({
                rule: 'Use const over let',
                source: 'correction',
                sessionId: 'sess-2',
            });
            engine.captureInstruction({
                rule: 'Use const over let',
                source: 'correction',
                sessionId: 'sess-3',
            });

            engine.autoPromote();

            const entry = storage.readEntry(
                DnaEngine.generateId('preferences', 'Use const over let'),
            );
            expect(entry).not.toBeNull();
            expect(entry!.status).toBe('approved');
        });

        it('does not promote entries below 3 sessions', () => {
            engine.captureInstruction({
                rule: 'Use const over let',
                source: 'correction',
                sessionId: 'sess-1',
            });
            engine.captureInstruction({
                rule: 'Use const over let',
                source: 'correction',
                sessionId: 'sess-2',
            });

            engine.autoPromote();

            const entry = storage.readEntry(
                DnaEngine.generateId('preferences', 'Use const over let'),
            );
            expect(entry).not.toBeNull();
            expect(entry!.status).toBe('suggested');
        });
    });

    describe('decayUnseenEntries', () => {
        it('decays unseen entries after 30 days', () => {
            const entry = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 35);
            const storedEntry = storage.readEntry(entry.id)!;
            storedEntry.evidence.last_seen = oldDate.toISOString().split('T')[0];
            storage.writeEntry(storedEntry);

            engine.decayUnseenEntries('sess-other');

            const decayed = storage.readEntry(entry.id);
            expect(decayed).not.toBeNull();
            expect(decayed!.confidence).toBe(0.25);
        });

        it('does not decay entries seen in the current session', () => {
            const entry = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 35);
            const storedEntry = storage.readEntry(entry.id)!;
            storedEntry.evidence.last_seen = oldDate.toISOString().split('T')[0];
            storage.writeEntry(storedEntry);

            engine.decayUnseenEntries('sess-1');

            const notDecayed = storage.readEntry(entry.id);
            expect(notDecayed!.confidence).toBe(0.3);
        });

        it('does not decay entries less than 30 days old', () => {
            const entry = engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            engine.decayUnseenEntries('sess-other');

            const notDecayed = storage.readEntry(entry.id);
            expect(notDecayed!.confidence).toBe(0.3);
        });
    });

    describe('reinforceObservedEntries', () => {
        it('boosts confidence for entries matching patterns', () => {
            engine.captureInstruction({
                rule: 'Use early returns in all functions',
                source: 'correction',
                sessionId: 'sess-1',
            });

            engine.reinforceObservedEntries(['early returns']);

            const entries = engine.getActiveEntries();
            expect(entries[0].confidence).toBeGreaterThan(0.3);
        });

        it('does nothing with empty patterns', () => {
            engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            engine.reinforceObservedEntries([]);

            const entries = engine.getActiveEntries();
            expect(entries[0].confidence).toBe(0.3);
        });
    });

    describe('batchPassiveReinforce', () => {
        it('slightly boosts suggested entries', () => {
            engine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'sess-1',
            });

            engine.batchPassiveReinforce();

            const entries = engine.getActiveEntries();
            expect(entries[0].confidence).toBe(0.35);
        });

        it('does not boost approved entries', () => {
            engine.captureInstruction({
                rule: 'Always use semicolons',
                source: 'explicit',
                sessionId: 'sess-1',
            });

            engine.batchPassiveReinforce();

            const entries = engine.getActiveEntries();
            expect(entries[0].confidence).toBe(1.0);
        });
    });

    describe('classifyCategory', () => {
        it('returns string category, not enum', () => {
            const result = DnaEngine.classifyCategory('Never use var');
            expect(typeof result).toBe('string');
            expect(result).toBe('anti-patterns');
        });

        it('classifies preference instructions', () => {
            expect(DnaEngine.classifyCategory('Use Drizzle instead of Prisma')).toBe('preferences');
            expect(DnaEngine.classifyCategory('Prefer server actions over API routes')).toBe(
                'preferences',
            );
        });

        it('classifies decision instructions', () => {
            expect(
                DnaEngine.classifyCategory('We chose Drizzle because of TypeScript inference'),
            ).toBe('decisions');
        });

        it('classifies style instructions', () => {
            expect(DnaEngine.classifyCategory('Name components with PascalCase')).toBe('style');
        });
    });

    describe('generateId', () => {
        it('generates id from category and slugified rule', () => {
            const id = DnaEngine.generateId('style', 'Use early returns in functions');
            expect(id).toBe('style-use-early-returns-in-functions');
        });

        it('truncates long content to 60 chars', () => {
            const id = DnaEngine.generateId(
                'style',
                'This is a very long instruction that should be truncated to a reasonable length',
            );
            expect(id.length).toBeLessThanOrEqual(60);
        });
    });

    describe('findSimilar', () => {
        it('returns empty array when no embeddings model', async () => {
            const matches = await engine.findSimilar('Use early returns');
            expect(matches).toEqual([]);
        });
    });
});
