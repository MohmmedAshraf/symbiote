import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DnaStorage } from '../../src/dna/storage.js';
import { DnaEngine } from '../../src/dna/engine.js';

describe('DNA Integration', () => {
    let tmpDir: string;
    let storage: DnaStorage;
    let engine: DnaEngine;

    beforeEach(() => {
        tmpDir = path.join(os.tmpdir(), `symbiote-integration-test-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        storage = new DnaStorage(tmpDir);
        storage.ensureDirectories();
        engine = new DnaEngine(storage);
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('full lifecycle: capture, review, approve/reject', () => {
        const entry1 = engine.captureInstruction(
            'Use early returns in functions',
            'session-1',
            'correction',
        );
        expect(entry1.frontmatter.status).toBe('suggested');

        engine.captureInstruction('Never use nested ternaries', 'session-1', 'correction');

        const entry3 = engine.captureInstruction(
            'Always use TypeScript strict mode',
            'session-1',
            'explicit',
        );
        expect(entry3.frontmatter.status).toBe('approved');
        expect(entry3.frontmatter.confidence).toBe(1.0);

        const active = engine.getActiveEntries();
        expect(active).toHaveLength(3);

        engine.approveEntry(entry1.frontmatter.id);
        const entry2 = storage.listEntries().find((e) => e.content.includes('nested ternaries'));
        engine.rejectEntry(entry2!.frontmatter.id);

        const activeAfter = engine.getActiveEntries();
        expect(activeAfter).toHaveLength(2);
        expect(activeAfter.every((e) => e.frontmatter.status !== 'rejected')).toBe(true);
    });

    it('auto-promotes after 3 unique sessions', () => {
        engine.captureInstruction('Use const over let', 'session-1', 'correction');
        engine.captureInstruction('Use const over let', 'session-2', 'correction');

        let entry = storage.readEntry(DnaEngine.generateId('preferences', 'Use const over let'));
        expect(entry!.frontmatter.status).toBe('suggested');

        engine.captureInstruction('Use const over let', 'session-3', 'correction');

        entry = storage.readEntry(DnaEngine.generateId('preferences', 'Use const over let'));
        expect(entry!.frontmatter.status).toBe('approved');
        expect(entry!.frontmatter.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('persists entries across storage instances', () => {
        engine.captureInstruction('Use early returns', 's1', 'correction');

        const storage2 = new DnaStorage(tmpDir);
        const engine2 = new DnaEngine(storage2);

        const entries = engine2.getActiveEntries();
        expect(entries).toHaveLength(1);
        expect(entries[0].content).toContain('early returns');
    });

    it('maintains correct directory structure', () => {
        engine.captureInstruction('Use early returns in functions', 's1', 'correction');
        engine.captureInstruction('Never use nested ternaries', 's1', 'correction');
        engine.captureInstruction('Prefer Drizzle over Prisma', 's1', 'correction');
        engine.captureInstruction(
            'We chose React for the UI because of ecosystem',
            's1',
            'correction',
        );

        expect(fs.readdirSync(path.join(tmpDir, 'style')).length).toBeGreaterThanOrEqual(1);
        expect(fs.readdirSync(path.join(tmpDir, 'anti-patterns')).length).toBeGreaterThanOrEqual(1);
        expect(fs.readdirSync(path.join(tmpDir, 'preferences')).length).toBeGreaterThanOrEqual(1);
        expect(fs.readdirSync(path.join(tmpDir, 'decisions')).length).toBeGreaterThanOrEqual(1);

        const index = storage.readIndex();
        expect(index.entries).toHaveLength(4);
    });

    it('edit updates content without changing metadata', () => {
        const entry = engine.captureInstruction('Use early returns', 's1', 'correction');
        const originalId = entry.frontmatter.id;

        const edited = engine.editEntry(
            originalId,
            'Use early returns to exit functions immediately. Avoid nesting logic in else blocks.',
        );

        expect(edited).toBeDefined();
        expect(edited!.frontmatter.id).toBe(originalId);
        expect(edited!.frontmatter.occurrences).toBe(1);
        expect(edited!.content).toContain('immediately');
    });

    it('delete removes entry from disk and index', () => {
        const entry = engine.captureInstruction('Temporary rule', 's1', 'correction');
        const id = entry.frontmatter.id;

        storage.deleteEntry(id);

        expect(storage.readEntry(id)).toBeNull();
        expect(storage.readIndex().entries.find((e) => e.id === id)).toBeUndefined();
    });
});
