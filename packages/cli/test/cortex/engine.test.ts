import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { CortexEngine } from '../../src/cortex/engine.js';

const SIMPLE = resolve(__dirname, '../fixtures/cortex/simple');

describe('CortexEngine', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;
    let engine: CortexEngine;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        engine = new CortexEngine(repo);
    });

    afterEach(async () => {
        await db.close();
    });

    it('runs all stages 0-3 sequentially', async () => {
        const result = await engine.run({ rootDir: SIMPLE });
        expect(result.stages).toHaveLength(4);
        expect(result.maxDepth).toBe(3);
    });

    it('stops at maxStage if specified', async () => {
        const result = await engine.run({ rootDir: SIMPLE, maxStage: 1 });
        expect(result.stages).toHaveLength(2);
        expect(result.maxDepth).toBe(1);
    });

    it('produces nodes and edges', async () => {
        const result = await engine.run({ rootDir: SIMPLE });
        expect(result.totalNodes).toBeGreaterThan(0);
        expect(result.totalEdges).toBeGreaterThan(0);
    });

    it('is incremental on second run', async () => {
        await engine.run({ rootDir: SIMPLE });
        const second = await engine.run({ rootDir: SIMPLE });
        expect(second.totalFiles).toBe(0);
    });

    it('force re-processes all files', async () => {
        await engine.run({ rootDir: SIMPLE });
        const forced = await engine.run({ rootDir: SIMPLE, force: true });
        expect(forced.totalFiles).toBe(4);
    });

    it('collects errors without crashing', async () => {
        const result = await engine.run({ rootDir: SIMPLE });
        expect(result.stages.every((s) => s.errors.length === 0)).toBe(true);
    });

    it('reports total duration', async () => {
        const result = await engine.run({ rootDir: SIMPLE });
        expect(result.totalDurationMs).toBeGreaterThan(0);
    });
});
