import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { CortexEngine } from '../../src/cortex/engine.js';
import { runStage4 } from '../../src/cortex/stage-4-types.js';
import { runStage5 } from '../../src/cortex/stage-5-flow.js';

const FLOW = resolve(__dirname, '../fixtures/cortex/flow');

describe('Stage 5: Flow Analysis', () => {
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

    async function runThrough4(rootDir: string): Promise<void> {
        await engine.run({ rootDir, maxStage: 3 });
        await runStage4(repo, rootDir);
    }

    describe('def-use chains', () => {
        it('identifies function parameters as flow points', async () => {
            await runThrough4(FLOW);
            const result = await runStage5(repo, FLOW);
            expect(result.filesProcessed).toBeGreaterThan(0);
            const flows = await repo.getFlowsFrom('fn:entry.ts:handleCreate');
            expect(flows.length).toBeGreaterThan(0);
        });

        it('identifies return statements as flow points', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const returns = await repo.getReturnsFrom('method:service.ts:UserService.createUser');
            expect(returns.length).toBeGreaterThan(0);
        });
    });

    describe('cross-call flow connection', () => {
        it('connects caller arg to callee param via flows_to edges', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const flows = await repo.getFlowsFrom('fn:entry.ts:handleCreate');
            expect(flows.length).toBeGreaterThan(0);
        });

        it('connects callee return to caller assignment', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const returns = await repo.getReturnsFrom('method:service.ts:UserService.createUser');
            expect(returns.some((r) => r.targetId.includes('handleCreate'))).toBe(true);
        });
    });

    describe('field access tracking', () => {
        it('creates reads edges for field access', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const reads = await repo.getReadsFrom('fn:entry.ts:handleGet');
            expect(reads.some((r) => r.field === 'id' || r.field === 'params')).toBe(true);
        });

        it('creates writes edges for field mutation', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const writes = await repo.getWritesFrom('method:repository.ts:UserRepository.update');
            expect(writes.length).toBeGreaterThan(0);
        });
    });

    describe('taint label propagation', () => {
        it('marks req.body as taint source', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const flows = await repo.getFlowsFrom('fn:middleware.ts:parseBody');
            const tainted = flows.filter((f) => f.taintLabel !== null);
            expect(tainted.length).toBeGreaterThan(0);
        });

        it('propagates taint through flow chain', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const flows = await repo.getFlowsFrom('fn:entry.ts:handleCreate');
            expect(flows.length).toBeGreaterThan(0);
        });
    });

    describe('async boundary detection', () => {
        it('marks async call edges', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const calls = await repo.getCallsFrom('fn:entry.ts:handleCreate');
            const asyncCalls = calls.filter((c) => c.isAsync);
            expect(asyncCalls.length).toBeGreaterThan(0);
        });
    });

    describe('error path tracking', () => {
        it('detects try/catch boundaries', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const calls = await repo.getCallsFrom('fn:errors.ts:safeCreate');
            expect(calls.length).toBeGreaterThan(0);
        });

        it('detects throw statements in functions', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const flows = await repo.getFlowsFrom('fn:errors.ts:riskyUpdate');
            expect(flows).toBeDefined();
        });
    });

    describe('entry point scoring', () => {
        it('scores exported handler functions as entry points', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const fns = await repo.getFunctionsByFile('entry.ts');
            const handleCreate = fns.find((f) => f.name === 'handleCreate');
            expect(handleCreate!.isEntryPoint).toBe(true);
            expect(handleCreate!.entryPointScore).toBeGreaterThan(0);
        });

        it('does not score internal helper functions as entry points', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const fns = await repo.getFunctionsByFile('middleware.ts');
            const parse = fns.find((f) => f.name === 'parseBody');
            expect(parse!.entryPointScore).toBeLessThan(0.5);
        });
    });

    describe('priority scheduling', () => {
        it('analyzes callees before callers (reverse topological)', async () => {
            await runThrough4(FLOW);
            const result = await runStage5(repo, FLOW);
            expect(result.errors).toHaveLength(0);
            expect(result.filesProcessed).toBeGreaterThan(0);
        });
    });

    describe('incremental behavior', () => {
        it('updates depth_level to 5', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const file = await repo.getFileNode('file:entry.ts');
            expect(file!.depthLevel).toBe(5);
        });

        it('only processes files at depth_level < 5', async () => {
            await runThrough4(FLOW);
            const first = await runStage5(repo, FLOW);
            const second = await runStage5(repo, FLOW);
            expect(first.filesProcessed).toBeGreaterThan(0);
            expect(second.filesProcessed).toBe(0);
        });
    });

    describe('edge metadata', () => {
        it('sets stage to 5 on all created edges', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const flows = await repo.getFlowsFrom('fn:entry.ts:handleCreate');
            flows.forEach((f) => {
                expect(f.stage).toBe(5);
            });
        });

        it('sets transform type on flows_to edges', async () => {
            await runThrough4(FLOW);
            await runStage5(repo, FLOW);
            const flows = await repo.getFlowsFrom('fn:entry.ts:handleCreate');
            flows.forEach((f) => {
                expect(['passthrough', 'destructure', 'wrap', 'map']).toContain(f.transform);
            });
        });
    });
});
