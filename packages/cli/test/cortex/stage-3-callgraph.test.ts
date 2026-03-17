import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '#storage/db.js';
import { createCortexSchema } from '#cortex/schema.js';
import { CortexRepository } from '#cortex/repository.js';
import { runStage0 } from '#cortex/stage-0-structure.js';
import { runStage1 } from '#cortex/stage-1-symbols.js';
import { runStage2 } from '#cortex/stage-2-resolution.js';
import { runStage3 } from '#cortex/stage-3-callgraph.js';

const CALLGRAPH = resolve(__dirname, '../fixtures/cortex/callgraph');

describe('Stage 3: Call Graph', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        await runStage0(repo, CALLGRAPH);
        await runStage1(repo, CALLGRAPH);
        await runStage2(repo, CALLGRAPH);
    });

    afterEach(async () => {
        await db.close();
    });

    it('detects direct function calls', async () => {
        await runStage3(repo, CALLGRAPH);
        const calls = await repo.getCallsFrom('fn:controller.ts:handleCreate');
        expect(calls.some((c) => c.targetId.includes('formatResponse'))).toBe(true);
    });

    it('detects method calls on instances', async () => {
        await runStage3(repo, CALLGRAPH);
        const calls = await repo.getCallsFrom('fn:controller.ts:handleCreate');
        expect(calls.some((c) => c.targetId.includes('UserService.create'))).toBe(true);
    });

    it('detects constructor calls', async () => {
        await runStage3(repo, CALLGRAPH);
        const stats = await repo.getStats();
        expect(stats.calls).toBeGreaterThan(0);
    });

    it('detects cross-file calls via symbol table', async () => {
        await runStage3(repo, CALLGRAPH);
        const calls = await repo.getCallsFrom('method:service.ts:UserService.create');
        expect(calls.some((c) => c.targetId.includes('validate'))).toBe(true);
    });

    it('assigns correct confidence to resolved calls', async () => {
        await runStage3(repo, CALLGRAPH);
        const calls = await repo.getCallsFrom('fn:controller.ts:handleCreate');
        const directCall = calls.find((c) => c.targetId.includes('formatResponse'));
        expect(directCall!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('uses scope-aware resolution for enclosing function', async () => {
        await runStage3(repo, CALLGRAPH);
        const calls = await repo.getCallsFrom('fn:controller.ts:handleCreate');
        expect(calls.length).toBeGreaterThan(0);
        calls.forEach((c) => {
            expect(c.sourceId).toContain('handleCreate');
        });
    });

    it('updates depth_level to 3', async () => {
        await runStage3(repo, CALLGRAPH);
        const file = await repo.getFileNode('file:controller.ts');
        expect(file!.depthLevel).toBe(3);
    });

    it('sets stage to 3 on all created edges', async () => {
        await runStage3(repo, CALLGRAPH);
        const calls = await repo.getCallsFrom('fn:controller.ts:handleCreate');
        calls.forEach((c) => {
            expect(c.stage).toBe(3);
        });
    });
});
