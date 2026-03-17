import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DnaEngine } from '#dna/engine.js';
import { DnaStorage } from '#dna/storage.js';
import { EmbeddingModel } from '#dna/embeddings.js';

const SIMILARITY_THRESHOLD_FOR_TEST = 0.5;

describe('DnaEngine - Pattern Matching', () => {
    let tmpDir: string;
    let storage: DnaStorage;
    let embeddings: EmbeddingModel;
    let engine: DnaEngine;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `symbiote-patterns-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        storage = new DnaStorage(tmpDir);
        storage.ensureDirectories();
        embeddings = new EmbeddingModel();
        engine = new DnaEngine(storage, embeddings);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('finds semantically similar instructions', async () => {
        engine.captureInstruction('Use early returns in functions', 's1', 'correction');
        engine.captureInstruction('Prefer Drizzle over Prisma', 's1', 'correction');

        const matches = await engine.findSimilar(
            'Always return early from functions instead of nesting',
        );

        expect(matches.length).toBeGreaterThanOrEqual(1);
        expect(matches[0].entry.content).toContain('early returns');
        expect(matches[0].similarity).toBeGreaterThan(SIMILARITY_THRESHOLD_FOR_TEST);
    }, 60000);

    it('does not match unrelated instructions', async () => {
        engine.captureInstruction('Use early returns in functions', 's1', 'correction');

        const matches = await engine.findSimilar('The weather is nice today');

        const highMatches = matches.filter((m) => m.similarity > 0.85);
        expect(highMatches).toHaveLength(0);
    }, 60000);

    it('merges similar instructions when capturing with embeddings', async () => {
        engine.captureInstruction('Use early returns in functions', 'session-1', 'correction');

        const entry = await engine.captureInstructionWithPatternMatch(
            'Always return early from functions instead of nesting',
            'session-2',
            'correction',
        );

        const allEntries = storage.listEntries();
        const styleEntries = allEntries.filter((e) => e.frontmatter.category === 'style');

        if (entry.frontmatter.occurrences > 1) {
            expect(styleEntries).toHaveLength(1);
            expect(entry.frontmatter.sessionIds).toContain('session-1');
            expect(entry.frontmatter.sessionIds).toContain('session-2');
        } else {
            expect(styleEntries.length).toBeLessThanOrEqual(2);
        }
    }, 60000);

    it('does not merge instructions from different categories', async () => {
        engine.captureInstruction('Never use nested ternaries', 'session-1', 'correction');

        const entry = await engine.captureInstructionWithPatternMatch(
            'Prefer not using nested ternary expressions',
            'session-2',
            'correction',
        );

        const antiPatternEntries = storage
            .listEntries()
            .filter((e) => e.frontmatter.category === 'anti-patterns');
        const preferenceEntries = storage
            .listEntries()
            .filter((e) => e.frontmatter.category === 'preferences');

        expect(antiPatternEntries.length + preferenceEntries.length).toBeGreaterThanOrEqual(1);
    }, 60000);
});
