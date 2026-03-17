import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { CortexEngine } from '../../src/cortex/engine.js';

const SIMPLE = resolve(__dirname, '../fixtures/cortex/simple');
const TYPED = resolve(__dirname, '../fixtures/cortex/typed');
const FLOW = resolve(__dirname, '../fixtures/cortex/flow');
const TOPOLOGY = resolve(__dirname, '../fixtures/cortex/topology');

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

    it('runs all stages 0-7 sequentially', async () => {
        const result = await engine.run({ rootDir: SIMPLE });
        expect(result.stages).toHaveLength(8);
        expect(result.maxDepth).toBe(7);
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
        expect(second.stages[0].filesProcessed).toBe(0);
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

describe('CortexEngine (Phase 2)', () => {
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

    it('runs all stages 0-5 sequentially', async () => {
        const result = await engine.run({ rootDir: FLOW, maxStage: 5 });
        expect(result.stages).toHaveLength(6);
        expect(result.maxDepth).toBe(5);
    });

    it('stops at maxStage 4 if specified', async () => {
        const result = await engine.run({ rootDir: TYPED, maxStage: 4 });
        expect(result.stages).toHaveLength(5);
        expect(result.maxDepth).toBe(4);
    });

    it('produces flow edges at Stage 5', async () => {
        const result = await engine.run({ rootDir: FLOW, maxStage: 5 });
        expect(result.totalEdges).toBeGreaterThan(0);
        const flows = await repo.getFlowsFrom('fn:entry.ts:handleCreate');
        expect(flows.length).toBeGreaterThan(0);
    });

    it('produces type constraints at Stage 4', async () => {
        const result = await engine.run({ rootDir: TYPED, maxStage: 4 });
        expect(result.totalNodes).toBeGreaterThan(0);
        const constraints = await repo.getTypeConstraints('var:inference.ts:repo');
        expect(constraints.length).toBeGreaterThan(0);
    });

    it('incremental: Stages 4-5 skip already-processed files', async () => {
        await engine.run({ rootDir: FLOW, maxStage: 5 });
        const second = await engine.run({ rootDir: FLOW, maxStage: 5 });
        expect(second.stages[4].filesProcessed).toBe(0);
        expect(second.stages[5].filesProcessed).toBe(0);
    });
});

describe('cascade invalidation (Phase 2)', () => {
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

    it('re-runs Stage 4 when signature changes', async () => {
        await engine.run({ rootDir: TYPED, maxStage: 4 });
        await repo.upsertFileNode({
            id: 'file:implementations.ts',
            path: 'implementations.ts',
            hash: 'changed-hash',
            language: 'typescript',
            depthLevel: 3,
            lastIndexed: null,
        });
        const result = await engine.run({ rootDir: TYPED, maxStage: 4 });
        expect(result.stages[4].filesProcessed).toBeGreaterThanOrEqual(1);
    });

    it('cleans up old Stage 4/5 data before re-processing', async () => {
        await engine.run({ rootDir: TYPED, maxStage: 4 });
        const before = await repo.getTypeConstraints('var:inference.ts:repo');
        expect(before.length).toBeGreaterThan(0);

        await repo.upsertFileNode({
            id: 'file:inference.ts',
            path: 'inference.ts',
            hash: 'changed',
            language: 'typescript',
            depthLevel: 3,
            lastIndexed: null,
        });
        await engine.run({ rootDir: TYPED, maxStage: 4 });
        const after = await repo.getTypeConstraints('var:inference.ts:repo');
        expect(after.length).toBeGreaterThan(0);
    });
});

describe('CortexEngine — Stages 6-7', () => {
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

    it('runs all stages 0-7 sequentially', async () => {
        const result = await engine.run({ rootDir: TOPOLOGY });
        expect(result.stages).toHaveLength(8);
        expect(result.maxDepth).toBe(7);
    });

    it('stops at maxStage 6 for topology-only', async () => {
        const result = await engine.run({ rootDir: TOPOLOGY, maxStage: 6 });
        expect(result.stages).toHaveLength(7);
        expect(result.maxDepth).toBe(6);
    });

    it('produces topology metadata after Stage 6', async () => {
        await engine.run({ rootDir: TOPOLOGY, maxStage: 6 });
        const flows = await repo.getAllFlows();
        expect(flows.length).toBeGreaterThan(0);
    });

    it('produces findings after Stage 7', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const raw = await repo.getMeta('findings');
        expect(raw).toBeTruthy();
    });
});
