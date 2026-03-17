import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { CortexEngine } from '../../src/cortex/engine.js';

const CALLGRAPH = resolve(__dirname, '../fixtures/cortex/callgraph');

describe('Cortex Integration', () => {
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

    it('full pipeline: structure → symbols → resolution → call graph', async () => {
        const result = await engine.run({ rootDir: CALLGRAPH });

        expect(result.maxDepth).toBe(3);
        expect(result.totalNodes).toBeGreaterThan(0);
        expect(result.totalEdges).toBeGreaterThan(0);

        const calls = await repo.getCallsFrom('fn:controller.ts:handleCreate');
        expect(calls.length).toBeGreaterThan(0);

        const imports = await repo.getImportsFrom('file:service.ts');
        expect(imports.some((e) => e.targetId === 'file:utils.ts')).toBe(true);

        const fns = await repo.getFunctionsByFile('utils.ts');
        expect(fns.some((f) => f.name === 'validate')).toBe(true);

        const file = await repo.getFileNode('file:controller.ts');
        expect(file!.depthLevel).toBe(3);
    });

    it('incremental: second run skips unchanged files', async () => {
        await engine.run({ rootDir: CALLGRAPH });
        const second = await engine.run({ rootDir: CALLGRAPH });
        expect(second.totalFiles).toBe(0);
    });

    it('stats reflect correct counts', async () => {
        await engine.run({ rootDir: CALLGRAPH });
        const stats = await repo.getStats();
        expect(stats.functions).toBeGreaterThan(0);
        expect(stats.classes).toBeGreaterThan(0);
        expect(stats.methods).toBeGreaterThan(0);
    });

    it('symbols view includes all symbol types', async () => {
        await engine.run({ rootDir: CALLGRAPH });
        const symbols = await repo.getAllSymbols();
        const kinds = new Set(symbols.map((s) => s.kind));
        expect(kinds.has('function')).toBe(true);
        expect(kinds.has('class')).toBe(true);
    });
});
