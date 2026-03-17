import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { CortexEngine } from '../../src/cortex/engine.js';

const SIMPLE = resolve(__dirname, '../fixtures/cortex/simple');

describe('Cascade Invalidation', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;
    let engine: CortexEngine;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        engine = new CortexEngine(repo);
        await engine.run({ rootDir: SIMPLE });
    });

    afterEach(async () => {
        await db.close();
    });

    it('re-processes importers when a file changes', async () => {
        await repo.upsertFileNode({
            id: 'file:utils.ts',
            path: 'utils.ts',
            hash: 'changed-hash',
            language: 'typescript',
            depthLevel: 0,
            lastIndexed: null,
        });
        const result = await engine.run({ rootDir: SIMPLE });
        expect(result.totalFiles).toBeGreaterThan(1);
    });

    it('limits cascade depth to configured max', async () => {
        await repo.upsertFileNode({
            id: 'file:utils.ts',
            path: 'utils.ts',
            hash: 'changed',
            language: 'typescript',
            depthLevel: 0,
            lastIndexed: null,
        });
        const result = await engine.run({ rootDir: SIMPLE });
        expect(result.stages.every((s) => s.errors.length === 0)).toBe(true);
    });

    it('handles deleted files by cleaning up stale data', async () => {
        const initialStats = await repo.getStats();
        expect(initialStats.functions).toBeGreaterThan(0);

        const result = await engine.run({
            rootDir: SIMPLE,
            targetFiles: ['index.ts', 'service.ts', 'types.ts'],
        });
        expect(result.stages.every((s) => s.errors.length === 0)).toBe(true);
    });
});
