import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { runStage0 } from '../../src/cortex/stage-0-structure.js';

const FIXTURES = resolve(__dirname, '../fixtures/cortex/simple');

describe('Stage 0: Structure', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
    });

    afterEach(async () => {
        await db.close();
    });

    it('discovers all source files', async () => {
        const result = await runStage0(repo, FIXTURES);
        expect(result.filesProcessed).toBe(4);
    });

    it('creates file nodes with correct language', async () => {
        await runStage0(repo, FIXTURES);
        const file = await repo.getFileNode('file:index.ts');
        expect(file).toBeDefined();
        expect(file!.language).toBe('typescript');
    });

    it('creates file nodes with content hash', async () => {
        await runStage0(repo, FIXTURES);
        const file = await repo.getFileNode('file:index.ts');
        expect(file!.hash).toBeTruthy();
        expect(file!.hash!.length).toBeGreaterThan(0);
    });

    it('creates module nodes', async () => {
        await runStage0(repo, FIXTURES);
        const stats = await repo.getStats();
        expect(stats.modules).toBeGreaterThan(0);
    });

    it('detects barrel files', async () => {
        const barrelFixtures = resolve(__dirname, '../fixtures/cortex/barrel');
        await runStage0(repo, barrelFixtures);
        const mod = await repo.getModuleNode('module:index.ts');
        expect(mod).toBeDefined();
        expect(mod!.isBarrel).toBe(true);
    });

    it('skips unchanged files on second run', async () => {
        const first = await runStage0(repo, FIXTURES);
        const second = await runStage0(repo, FIXTURES);
        expect(second.filesProcessed).toBe(0);
        expect(first.filesProcessed).toBe(4);
    });

    it('re-processes changed files', async () => {
        await runStage0(repo, FIXTURES);
        await repo.upsertFileNode({
            id: 'file:index.ts',
            path: 'index.ts',
            hash: 'stale-hash',
            language: 'typescript',
            depthLevel: 0,
            lastIndexed: null,
        });
        const result = await runStage0(repo, FIXTURES);
        expect(result.filesProcessed).toBe(1);
    });

    it('sets depth_level to 0 on file nodes', async () => {
        await runStage0(repo, FIXTURES);
        const file = await repo.getFileNode('file:index.ts');
        expect(file!.depthLevel).toBe(0);
    });

    it('returns errors for unreadable files without crashing', async () => {
        const result = await runStage0(repo, '/nonexistent/path');
        expect(result.filesProcessed).toBe(0);
        expect(result.errors.length).toBe(0);
    });
});
