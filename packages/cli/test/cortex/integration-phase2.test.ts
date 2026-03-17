import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { CortexEngine } from '../../src/cortex/engine.js';

const TYPED = resolve(__dirname, '../fixtures/cortex/typed');
const FLOW = resolve(__dirname, '../fixtures/cortex/flow');

describe('Phase 2 integration: typed fixture', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;
    let engine: CortexEngine;

    beforeAll(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        engine = new CortexEngine(repo);
        await engine.run({ rootDir: TYPED, maxStage: 5 });
    });

    afterAll(async () => {
        await db.close();
    });

    it('creates type constraints for annotated variables', async () => {
        const constraints = await repo.getTypeConstraints('var:inference.ts:repo');
        expect(constraints.length).toBeGreaterThan(0);
        const typeNames = constraints.map((c) => c.typeName);
        expect(typeNames.some((t) => t.includes('InMemoryUserRepo'))).toBe(true);
    });

    it('creates implements edges for classes', async () => {
        const stats = await repo.getStats();
        expect(stats.implements).toBeGreaterThan(0);
        const impls = await repo.getImplementorsOf('interface:implementations.ts:IUserService');
        expect(impls.length).toBeGreaterThan(0);
        expect(impls.some((e) => e.sourceId.includes('UserService'))).toBe(true);
    });

    it('creates extends edges for inheritance', async () => {
        const allSymbols = await repo.getAllSymbols();
        const userEntity = allSymbols.find((s) => s.name === 'UserEntity');
        expect(userEntity).toBeDefined();
    });

    it('creates generic instantiations', async () => {
        const allSymbols = await repo.getAllSymbols();
        const genericSymbols = allSymbols.filter(
            (s) => s.id.includes('getOrSet') || s.id.includes('userCache'),
        );
        expect(genericSymbols.length).toBeGreaterThan(0);
    });

    it('incremental run skips already-processed files', async () => {
        const second = await engine.run({ rootDir: TYPED, maxStage: 5 });
        for (const stage of second.stages) {
            expect(stage.filesProcessed).toBe(0);
        }
    });

    it('stats reflect all node and edge types', async () => {
        const stats = await repo.getStats();
        expect(stats.files).toBeGreaterThan(0);
        expect(stats.classes).toBeGreaterThan(0);
        expect(stats.interfaces).toBeGreaterThan(0);
        expect(stats.functions).toBeGreaterThan(0);
        expect(stats.variables).toBeGreaterThan(0);
    });
});

describe('Phase 2 integration: flow fixture', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;
    let engine: CortexEngine;

    beforeAll(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        engine = new CortexEngine(repo);
        await engine.run({ rootDir: FLOW, maxStage: 5 });
    });

    afterAll(async () => {
        await db.close();
    });

    it('produces flows_to edges from entry points', async () => {
        const flows = await repo.getFlowsFrom('fn:entry.ts:handleCreate');
        expect(flows.length).toBeGreaterThan(0);
    });

    it('produces reads edges', async () => {
        const stats = await repo.getStats();
        expect(stats.reads).toBeGreaterThan(0);
    });

    it('produces returns edges', async () => {
        const stats = await repo.getStats();
        expect(stats.returns).toBeGreaterThan(0);
    });

    it('traces a multi-hop flow path', async () => {
        const visited = new Set<string>();
        const queue = ['fn:entry.ts:handleCreate'];
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);

            const flows = await repo.getFlowsFrom(current);
            const calls = await repo.getCallsFrom(current);

            for (const f of flows) {
                if (!visited.has(f.targetId)) queue.push(f.targetId);
            }
            for (const c of calls) {
                if (!visited.has(c.targetId)) queue.push(c.targetId);
            }
        }
        expect(visited.size).toBeGreaterThan(1);
    });

    it('incremental run skips stages 4-5', async () => {
        const second = await engine.run({ rootDir: FLOW, maxStage: 5 });
        expect(second.stages[4].filesProcessed).toBe(0);
        expect(second.stages[5].filesProcessed).toBe(0);
    });

    it('cascade invalidation re-processes dependent files', async () => {
        await repo.upsertFileNode({
            id: 'file:repository.ts',
            path: 'repository.ts',
            hash: 'cascade-trigger',
            language: 'typescript',
            depthLevel: 3,
            lastIndexed: null,
        });
        const result = await engine.run({ rootDir: FLOW, maxStage: 5 });
        expect(result.stages[0].filesProcessed).toBeGreaterThanOrEqual(1);
    });

    it('symbol view contains all node types', async () => {
        const symbols = await repo.getAllSymbols();
        const kinds = new Set(symbols.map((s) => s.kind));
        expect(kinds.has('function')).toBe(true);
        expect(kinds.has('class')).toBe(true);
    });

    it('getSymbolById resolves known symbols', async () => {
        const symbol = await repo.getSymbolById('fn:entry.ts:handleCreate');
        expect(symbol).not.toBeNull();
        expect(symbol!.name).toBe('handleCreate');
        expect(symbol!.kind).toBe('function');
    });

    it('getSymbolByName resolves by name', async () => {
        const symbols = await repo.getSymbolByName('handleCreate');
        expect(symbols.length).toBeGreaterThan(0);
        expect(symbols[0].name).toBe('handleCreate');
    });
});
