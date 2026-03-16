import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapDna } from '../../src/init/dna-bootstrap.js';
import { DnaStorage } from '../../src/dna/storage.js';
import { DnaEngine } from '../../src/dna/engine.js';
import type { ClassifiedRule } from '../../src/init/parsers/types.js';

function makeTmpDir(): string {
    return mkdtempSync(join(tmpdir(), 'symbiote-dna-test-'));
}

function makeRule(text: string, target: 'dna' | 'intent' = 'dna'): ClassifiedRule {
    return {
        text,
        classification: target === 'dna' ? 'style' : 'constraint',
        source: 'CLAUDE.md',
        target,
    };
}

describe('bootstrapDna', () => {
    it('returns zero counts when dna directory is empty', () => {
        const tmpDir = makeTmpDir();
        try {
            const result = bootstrapDna(tmpDir);
            expect(result.existingEntries).toBe(0);
            expect(result.loadedEntries).toEqual([]);
            expect(result.importedEntries).toBe(0);
            expect(result.skippedEntries).toBe(0);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('loads existing DNA entries', () => {
        const tmpDir = makeTmpDir();
        try {
            const dnaDir = join(tmpDir, 'dna');
            const storage = new DnaStorage(dnaDir);
            storage.ensureDirectories();
            const engine = new DnaEngine(storage);
            engine.captureInstruction('Use 4-space indentation', 'seed', 'explicit');

            const result = bootstrapDna(tmpDir);
            expect(result.existingEntries).toBe(1);
            expect(result.loadedEntries).toHaveLength(1);
            expect(result.loadedEntries[0].content).toBe('Use 4-space indentation');
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('imports new dna-targeted rules', () => {
        const tmpDir = makeTmpDir();
        try {
            const rules: ClassifiedRule[] = [
                makeRule('Prefer early returns over nested conditions'),
                makeRule('Use named exports everywhere'),
            ];

            const result = bootstrapDna(tmpDir, rules);
            expect(result.importedEntries).toBe(2);
            expect(result.skippedEntries).toBe(0);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('skips rules that already exist as DNA entries', () => {
        const tmpDir = makeTmpDir();
        try {
            const dnaDir = join(tmpDir, 'dna');
            const storage = new DnaStorage(dnaDir);
            storage.ensureDirectories();
            const engine = new DnaEngine(storage);
            engine.captureInstruction('Use named exports everywhere', 'seed', 'explicit');

            const rules: ClassifiedRule[] = [
                makeRule('Use named exports everywhere'),
                makeRule('4-space indentation'),
            ];

            const result = bootstrapDna(tmpDir, rules);
            expect(result.existingEntries).toBe(1);
            expect(result.skippedEntries).toBe(1);
            expect(result.importedEntries).toBe(1);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('ignores intent-targeted rules', () => {
        const tmpDir = makeTmpDir();
        try {
            const rules: ClassifiedRule[] = [
                makeRule('All mutations through server actions', 'intent'),
                makeRule('Use 4-space indentation', 'dna'),
            ];

            const result = bootstrapDna(tmpDir, rules);
            expect(result.importedEntries).toBe(1);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
