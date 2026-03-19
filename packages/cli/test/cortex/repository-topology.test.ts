import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, SymbioteDB } from '#storage/db.js';
import { createCortexSchema } from '#cortex/schema.js';
import { CortexRepository } from '#cortex/repository.js';

describe('CortexRepository — Topology', () => {
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

    describe('updateNodeMetrics', () => {
        it('writes community, pageRank, betweenness to function nodes', async () => {
            await repo.insertFunctionNodes([
                {
                    id: 'fn:test.ts:foo',
                    name: 'foo',
                    qualifiedName: 'foo',
                    filePath: 'test.ts',
                    lineStart: 1,
                    lineEnd: 5,
                    isAsync: false,
                    isExported: true,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature: null,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
            ]);

            await repo.updateNodeMetrics('fn:test.ts:foo', {
                community: 3,
                pageRank: 0.42,
                betweenness: 0.15,
            });

            const fns = await repo.getFunctionsByFile('test.ts');
            const fn = fns.find((f) => f.id === 'fn:test.ts:foo');
            expect(fn!.community).toBe(3);
            expect(fn!.pageRank).toBeCloseTo(0.42);
            expect(fn!.betweenness).toBeCloseTo(0.15);
        });

        it('writes metrics to class nodes', async () => {
            await repo.insertClassNodes([
                {
                    id: 'class:test.ts:Foo',
                    name: 'Foo',
                    filePath: 'test.ts',
                    lineStart: 1,
                    lineEnd: 10,
                    isAbstract: false,
                    isExported: true,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
            ]);

            await repo.updateNodeMetrics('class:test.ts:Foo', {
                community: 1,
                pageRank: 0.8,
                betweenness: 0.3,
            });

            const classes = await repo.getClassesByFile('test.ts');
            const cls = classes.find((c) => c.id === 'class:test.ts:Foo');
            expect(cls!.community).toBe(1);
            expect(cls!.pageRank).toBeCloseTo(0.8);
        });

        it('writes metrics to method nodes', async () => {
            await repo.insertMethodNodes([
                {
                    id: 'method:test.ts:Foo.bar',
                    name: 'bar',
                    className: 'Foo',
                    qualifiedName: 'Foo.bar',
                    filePath: 'test.ts',
                    lineStart: 3,
                    lineEnd: 7,
                    visibility: 'public',
                    isStatic: false,
                    isAsync: false,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
            ]);

            await repo.updateNodeMetrics('method:test.ts:Foo.bar', {
                community: 2,
                pageRank: 0.5,
                betweenness: 0.1,
            });

            const methods = await repo.getMethodsByFile('test.ts');
            const method = methods.find((m) => m.id === 'method:test.ts:Foo.bar');
            expect(method!.community).toBe(2);
        });
    });

    describe('updateNodeMetricsBatch', () => {
        it('updates multiple nodes in a single call', async () => {
            await repo.insertFunctionNodes([
                {
                    id: 'fn:a.ts:alpha',
                    name: 'alpha',
                    qualifiedName: 'alpha',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                    isAsync: false,
                    isExported: true,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature: null,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
                {
                    id: 'fn:b.ts:beta',
                    name: 'beta',
                    qualifiedName: 'beta',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                    isAsync: false,
                    isExported: true,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature: null,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
            ]);

            await repo.updateNodeMetricsBatch([
                { nodeId: 'fn:a.ts:alpha', community: 0, pageRank: 0.9, betweenness: 0.5 },
                { nodeId: 'fn:b.ts:beta', community: 1, pageRank: 0.1, betweenness: 0.01 },
            ]);

            const alphaResults = await repo.getFunctionsByFile('a.ts');
            const alpha = alphaResults.find((f) => f.id === 'fn:a.ts:alpha');
            const betaResults = await repo.getFunctionsByFile('b.ts');
            const beta = betaResults.find((f) => f.id === 'fn:b.ts:beta');
            expect(alpha!.community).toBe(0);
            expect(beta!.community).toBe(1);
        });
    });

    describe('cortex_flows CRUD', () => {
        it('inserts and retrieves execution flows', async () => {
            await repo.insertFlows([
                {
                    id: 'flow:handleGetUser',
                    name: 'handleGetUser',
                    entryPointId: 'fn:controller.ts:handleGetUser',
                    nodeIds: [
                        'fn:controller.ts:handleGetUser',
                        'method:service.ts:UserService.getUser',
                        'method:repository.ts:UserRepository.findById',
                    ],
                    hasAsync: true,
                    hasErrorPath: false,
                },
            ]);

            const flows = await repo.getFlowsByEntryPoint('fn:controller.ts:handleGetUser');
            const flow = flows.find((f) => f.id === 'flow:handleGetUser');
            expect(flow).not.toBeNull();
            expect(flow!.name).toBe('handleGetUser');
            expect(flow!.nodeIds).toHaveLength(3);
            expect(flow!.hasAsync).toBe(true);
        });

        it('retrieves flows by entry point', async () => {
            await repo.insertFlows([
                {
                    id: 'flow:a',
                    name: 'a',
                    entryPointId: 'fn:x.ts:a',
                    nodeIds: ['fn:x.ts:a', 'fn:x.ts:b'],
                    hasAsync: false,
                    hasErrorPath: false,
                },
                {
                    id: 'flow:c',
                    name: 'c',
                    entryPointId: 'fn:y.ts:c',
                    nodeIds: ['fn:y.ts:c'],
                    hasAsync: false,
                    hasErrorPath: false,
                },
            ]);

            const flows = await repo.getFlowsByEntryPoint('fn:x.ts:a');
            expect(flows).toHaveLength(1);
            expect(flows[0].id).toBe('flow:a');
        });

        it('retrieves flows by different entry points', async () => {
            await repo.insertFlows([
                {
                    id: 'flow:1',
                    name: 'one',
                    entryPointId: 'fn:a.ts:one',
                    nodeIds: ['fn:a.ts:one'],
                    hasAsync: false,
                    hasErrorPath: false,
                },
                {
                    id: 'flow:2',
                    name: 'two',
                    entryPointId: 'fn:b.ts:two',
                    nodeIds: ['fn:b.ts:two'],
                    hasAsync: false,
                    hasErrorPath: false,
                },
            ]);

            const flowsA = await repo.getFlowsByEntryPoint('fn:a.ts:one');
            const flowsB = await repo.getFlowsByEntryPoint('fn:b.ts:two');
            expect(flowsA).toHaveLength(1);
            expect(flowsB).toHaveLength(1);
            expect(flowsA[0].id).toBe('flow:1');
            expect(flowsB[0].id).toBe('flow:2');
        });

        it('deletes all flows', async () => {
            await repo.insertFlows([
                {
                    id: 'flow:x',
                    name: 'x',
                    entryPointId: 'fn:x.ts:x',
                    nodeIds: ['fn:x.ts:x'],
                    hasAsync: false,
                    hasErrorPath: false,
                },
            ]);

            await db.run('DELETE FROM cortex_flows');
            const flows = await repo.getFlowsByEntryPoint('fn:x.ts:x');
            expect(flows).toHaveLength(0);
        });
    });

    describe('cortex_meta CRUD', () => {
        it('sets and gets metadata by key', async () => {
            await repo.setMeta('test_key', 'test_value');
            const value = await repo.getMeta('test_key');
            expect(value).toBe('test_value');
        });

        it('returns null for missing key', async () => {
            const value = await repo.getMeta('nonexistent');
            expect(value).toBeNull();
        });

        it('overwrites existing key', async () => {
            await repo.setMeta('key', 'first');
            await repo.setMeta('key', 'second');
            const value = await repo.getMeta('key');
            expect(value).toBe('second');
        });
    });

    describe('getMaxDepthLevel', () => {
        it('returns max depth level from file nodes', async () => {
            await repo.upsertFileNode({
                id: 'file:a.ts',
                path: 'a.ts',
                hash: null,
                language: 'typescript',
                depthLevel: 3,
                lastIndexed: null,
            });
            await repo.upsertFileNode({
                id: 'file:b.ts',
                path: 'b.ts',
                hash: null,
                language: 'typescript',
                depthLevel: 6,
                lastIndexed: null,
            });

            const max = await repo.getMaxDepthLevel();
            expect(max).toBe(6);
        });

        it('returns 0 when no file nodes exist', async () => {
            const max = await repo.getMaxDepthLevel();
            expect(max).toBe(0);
        });
    });

    describe('getAllFunctions', () => {
        it('returns all function nodes', async () => {
            await repo.insertFunctionNodes([
                {
                    id: 'fn:a.ts:foo',
                    name: 'foo',
                    qualifiedName: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                    isAsync: false,
                    isExported: true,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature: null,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
                {
                    id: 'fn:b.ts:bar',
                    name: 'bar',
                    qualifiedName: 'bar',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                    isAsync: true,
                    isExported: false,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature: null,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
            ]);

            const fns = await repo.getAllFunctions();
            expect(fns).toHaveLength(2);
        });
    });

    describe('getAllFileNodes', () => {
        it('returns all file nodes', async () => {
            await repo.upsertFileNode({
                id: 'file:a.ts',
                path: 'a.ts',
                hash: null,
                language: 'typescript',
                depthLevel: 0,
                lastIndexed: null,
            });
            await repo.upsertFileNode({
                id: 'file:b.ts',
                path: 'b.ts',
                hash: null,
                language: 'typescript',
                depthLevel: 0,
                lastIndexed: null,
            });

            const files = await repo.getAllFileNodes();
            expect(files).toHaveLength(2);
        });
    });
});
