import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '#storage/db.js';
import { createCortexSchema } from '#cortex/schema.js';
import { CortexRepository } from '#cortex/repository.js';
import { CortexEngine } from '#cortex/engine.js';
import { runStage4 } from '#cortex/stage-4-types.js';

const TYPED = resolve(__dirname, '../fixtures/cortex/typed');
const CALLGRAPH = resolve(__dirname, '../fixtures/cortex/callgraph');

describe('Stage 4: Type Inference', () => {
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

    async function runThrough3(rootDir: string): Promise<void> {
        await engine.run({ rootDir, maxStage: 3 });
    }

    describe('seed phase', () => {
        it('collects explicit type annotations as constraints', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const constraints = await repo.getTypeConstraints(
                'method:implementations.ts:UserService.create',
            );
            expect(constraints.some((c) => c.source === 'annotation')).toBe(true);
        });

        it('collects constructor calls as constraints', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const constraints = await repo.getTypeConstraints('var:inference.ts:repo');
            expect(
                constraints.some(
                    (c) => c.typeName === 'InMemoryUserRepo' && c.source === 'constructor',
                ),
            ).toBe(true);
        });

        it('seeds constraints with correct confidence', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const constraints = await repo.getTypeConstraints('var:inference.ts:repo');
            const ctorConstraint = constraints.find((c) => c.source === 'constructor');
            expect(ctorConstraint!.confidence).toBeCloseTo(0.9);
        });
    });

    describe('propagation', () => {
        it('propagates return types through assignment chains', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const constraints = await repo.getTypeConstraints('var:inference.ts:service');
            expect(constraints.some((c) => c.typeName === 'UserService')).toBe(true);
        });

        it('propagates through function return to caller assignment', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const constraints = await repo.getTypeConstraintsByType('User');
            expect(constraints.length).toBeGreaterThan(0);
        });
    });

    describe('interface -> implementation mapping', () => {
        it('creates implements edges for explicit implements clause', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const impls = await repo.getImplementorsOf('interface:implementations.ts:IUserService');
            expect(impls.some((e) => e.sourceId.includes('UserService'))).toBe(true);
        });

        it('maps generic interface implementations', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const impls = await repo.getImplementorsOf('interface:implementations.ts:IRepository');
            expect(impls.some((e) => e.sourceId.includes('InMemoryUserRepo'))).toBe(true);
        });
    });

    describe('generic instantiation tracking', () => {
        it('tracks Map<string, User> instantiation', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const insts = await repo.getGenericInstantiations('var:generics.ts:userCache');
            expect(
                insts.some(
                    (i) =>
                        i.genericName === 'Map' &&
                        i.typeArguments.includes('string') &&
                        i.typeArguments.includes('User'),
                ),
            ).toBe(true);
        });

        it('tracks Set<string> instantiation', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const insts = await repo.getGenericInstantiations('var:generics.ts:idSet');
            expect(insts.some((i) => i.genericName === 'Set')).toBe(true);
        });
    });

    describe('heritage chain resolution', () => {
        it('resolves full extends chain', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const stats = await repo.getStats();
            expect(stats.classes).toBeGreaterThanOrEqual(3);
        });
    });

    describe('call graph refinement', () => {
        it('re-scores previously unresolved call edges', async () => {
            await runThrough3(CALLGRAPH);
            await runStage4(repo, CALLGRAPH);
            const calls = await repo.getCallsFrom('fn:controller.ts:handleCreate');
            calls.forEach((c) => {
                expect(c.confidence).toBeGreaterThanOrEqual(0.4);
            });
        });
    });

    describe('confidence scoring', () => {
        it('assigns 0.95 to explicit annotations', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const constraints = await repo.getTypeConstraints(
                'method:implementations.ts:UserService.create',
            );
            const annotation = constraints.find((c) => c.source === 'annotation');
            if (annotation) {
                expect(annotation.confidence).toBeCloseTo(0.95);
            }
        });

        it('assigns 0.90 to constructor inferences', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const constraints = await repo.getTypeConstraints('var:inference.ts:repo');
            const ctor = constraints.find((c) => c.source === 'constructor');
            expect(ctor!.confidence).toBeCloseTo(0.9);
        });
    });

    describe('incremental behavior', () => {
        it('updates depth_level to 4', async () => {
            await runThrough3(TYPED);
            await runStage4(repo, TYPED);
            const file = await repo.getFileNode('file:inference.ts');
            expect(file!.depthLevel).toBe(4);
        });

        it('only processes files at depth_level < 4', async () => {
            await runThrough3(TYPED);
            const first = await runStage4(repo, TYPED);
            const second = await runStage4(repo, TYPED);
            expect(first.filesProcessed).toBeGreaterThan(0);
            expect(second.filesProcessed).toBe(0);
        });
    });

    describe('error resilience', () => {
        it('reports errors without crashing', async () => {
            await runThrough3(TYPED);
            const result = await runStage4(repo, TYPED);
            expect(result.errors).toBeDefined();
            expect(result.stage).toBe(4);
        });
    });
});
