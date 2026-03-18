import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DnaEngine } from '#dna/engine.js';
import { DnaStorage } from '#dna/storage.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('DnaEngine confidence lifecycle', () => {
    let storage: DnaStorage;
    let engine: DnaEngine;
    let dnaDir: string;

    beforeEach(() => {
        dnaDir = path.join(os.tmpdir(), `test-dna-${Date.now()}`);
        fs.mkdirSync(dnaDir, { recursive: true });
        storage = new DnaStorage(dnaDir);
        storage.ensureDirectories();
        engine = new DnaEngine(storage);
    });

    afterEach(() => {
        fs.rmSync(dnaDir, { recursive: true, force: true });
    });

    describe('batchPassiveReinforce', () => {
        it('bumps confidence of suggested entries by 0.05', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            expect(entry.frontmatter.confidence).toBe(0.3);

            engine.batchPassiveReinforce();

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBeCloseTo(0.35, 5);
        });

        it('does not exceed 0.99', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            entry.frontmatter.confidence = 0.97;
            storage.writeEntry(entry);

            engine.batchPassiveReinforce();

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(0.99);
        });

        it('does not touch approved entries', () => {
            const entry = engine.captureInstruction('Always use const', 's1', 'explicit');
            expect(entry.frontmatter.status).toBe('approved');
            const originalConfidence = entry.frontmatter.confidence;

            engine.batchPassiveReinforce();

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(originalConfidence);
        });

        it('does not touch rejected entries', () => {
            const entry = engine.captureInstruction('Use var', 's1', 'correction');
            engine.rejectEntry(entry.frontmatter.id);
            const rejected = storage.readEntry(entry.frontmatter.id);
            const originalConfidence = rejected!.frontmatter.confidence;

            engine.batchPassiveReinforce();

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(originalConfidence);
        });
    });

    describe('decayUnseenEntries', () => {
        it('reduces confidence for entries with lastSeen > 30 days ago', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
            entry.frontmatter.lastSeen = oldDate;
            storage.writeEntry(entry);

            engine.decayUnseenEntries('different-session');

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBeCloseTo(0.25, 5);
        });

        it('does not decay entries seen within 30 days', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
            entry.frontmatter.lastSeen = recentDate;
            storage.writeEntry(entry);

            engine.decayUnseenEntries('different-session');

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(0.3);
        });

        it('does not decay entries that include the current session', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
            entry.frontmatter.lastSeen = oldDate;
            storage.writeEntry(entry);

            engine.decayUnseenEntries('s1');

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(0.3);
        });

        it('does not go below 0.05', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
            entry.frontmatter.lastSeen = oldDate;
            entry.frontmatter.confidence = 0.06;
            storage.writeEntry(entry);

            engine.decayUnseenEntries('different-session');

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(0.05);
        });

        it('does not decay rejected entries', () => {
            const entry = engine.captureInstruction('Use var', 's1', 'correction');
            engine.rejectEntry(entry.frontmatter.id);

            const rejected = storage.readEntry(entry.frontmatter.id);
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split('T')[0];
            rejected!.frontmatter.lastSeen = oldDate;
            storage.writeEntry(rejected!);
            const originalConfidence = rejected!.frontmatter.confidence;

            engine.decayUnseenEntries('different-session');

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(originalConfidence);
        });
    });

    describe('autoPromote', () => {
        it('promotes suggested entries with confidence >= 0.7 and 3+ sessions', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            entry.frontmatter.confidence = 0.75;
            entry.frontmatter.sessionIds = ['s1', 's2', 's3'];
            storage.writeEntry(entry);

            engine.autoPromote();

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.status).toBe('approved');
        });

        it('does not promote if confidence is below 0.7', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            entry.frontmatter.confidence = 0.65;
            entry.frontmatter.sessionIds = ['s1', 's2', 's3'];
            storage.writeEntry(entry);

            engine.autoPromote();

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.status).toBe('suggested');
        });

        it('does not promote if fewer than 3 sessions', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            entry.frontmatter.confidence = 0.8;
            entry.frontmatter.sessionIds = ['s1', 's2'];
            storage.writeEntry(entry);

            engine.autoPromote();

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.status).toBe('suggested');
        });

        it('does not touch already approved entries', () => {
            const entry = engine.captureInstruction('Always use const', 's1', 'explicit');
            expect(entry.frontmatter.status).toBe('approved');

            engine.autoPromote();

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.status).toBe('approved');
        });

        it('does not touch rejected entries', () => {
            const entry = engine.captureInstruction('Use var', 's1', 'correction');
            engine.rejectEntry(entry.frontmatter.id);

            const rejected = storage.readEntry(entry.frontmatter.id);
            rejected!.frontmatter.confidence = 0.9;
            rejected!.frontmatter.sessionIds = ['s1', 's2', 's3'];
            storage.writeEntry(rejected!);

            engine.autoPromote();

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.status).toBe('rejected');
        });
    });

    describe('reinforceObservedEntries', () => {
        it('boosts entries whose content matches a pattern keyword', () => {
            const entry = engine.captureInstruction(
                'Use early returns in functions',
                's1',
                'correction',
            );
            const originalConfidence = entry.frontmatter.confidence;

            engine.reinforceObservedEntries(['early returns']);

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBeCloseTo(originalConfidence + 0.1, 5);
        });

        it('is case insensitive', () => {
            const entry = engine.captureInstruction(
                'Use Early Returns In Functions',
                's1',
                'correction',
            );
            const originalConfidence = entry.frontmatter.confidence;

            engine.reinforceObservedEntries(['early returns']);

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBeCloseTo(originalConfidence + 0.1, 5);
        });

        it('does not boost entries that do not match', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            const originalConfidence = entry.frontmatter.confidence;

            engine.reinforceObservedEntries(['TypeScript strict mode']);

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(originalConfidence);
        });

        it('does not exceed 0.99', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            entry.frontmatter.confidence = 0.95;
            storage.writeEntry(entry);

            engine.reinforceObservedEntries(['early returns']);

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(0.99);
        });

        it('does not boost rejected entries', () => {
            const entry = engine.captureInstruction('Use var always', 's1', 'correction');
            engine.rejectEntry(entry.frontmatter.id);

            const rejected = storage.readEntry(entry.frontmatter.id);
            const originalConfidence = rejected!.frontmatter.confidence;

            engine.reinforceObservedEntries(['var']);

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(originalConfidence);
        });

        it('does nothing when patterns array is empty', () => {
            const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
            const originalConfidence = entry.frontmatter.confidence;

            engine.reinforceObservedEntries([]);

            const updated = storage.readEntry(entry.frontmatter.id);
            expect(updated!.frontmatter.confidence).toBe(originalConfidence);
        });
    });
});
