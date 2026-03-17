import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import type {
    FunctionNode,
    ClassNode,
    CallsEdge,
    ContainsEdge,
    TypeConstraint,
    GenericInstantiation,
    FlowsToEdge,
    ReadsEdge,
    WritesEdge,
    ReturnsEdge,
    ImplementsEdge,
} from '../../src/cortex/types.js';

describe('CortexRepository', () => {
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

    describe('file nodes', () => {
        it('inserts and retrieves a file node', async () => {
            await repo.upsertFileNode({
                id: 'file:src/index.ts',
                path: 'src/index.ts',
                hash: 'abc123',
                language: 'typescript',
                depthLevel: 0,
                lastIndexed: null,
            });
            const file = await repo.getFileNode('file:src/index.ts');
            expect(file).toBeDefined();
            expect(file!.path).toBe('src/index.ts');
            expect(file!.hash).toBe('abc123');
        });

        it('upserts file node on conflict', async () => {
            await repo.upsertFileNode({
                id: 'file:src/index.ts',
                path: 'src/index.ts',
                hash: 'abc',
                language: 'typescript',
                depthLevel: 0,
                lastIndexed: null,
            });
            await repo.upsertFileNode({
                id: 'file:src/index.ts',
                path: 'src/index.ts',
                hash: 'def',
                language: 'typescript',
                depthLevel: 1,
                lastIndexed: null,
            });
            const file = await repo.getFileNode('file:src/index.ts');
            expect(file!.hash).toBe('def');
            expect(file!.depthLevel).toBe(1);
        });

        it('checks if file changed by hash', async () => {
            await repo.upsertFileNode({
                id: 'file:src/index.ts',
                path: 'src/index.ts',
                hash: 'abc',
                language: 'typescript',
                depthLevel: 0,
                lastIndexed: null,
            });
            expect(await repo.isFileChanged('file:src/index.ts', 'abc')).toBe(false);
            expect(await repo.isFileChanged('file:src/index.ts', 'xyz')).toBe(true);
            expect(await repo.isFileChanged('file:src/new.ts', 'abc')).toBe(true);
        });
    });

    describe('function nodes', () => {
        it('inserts and retrieves function nodes', async () => {
            const fn: FunctionNode = {
                id: 'fn:src/index.ts:main',
                name: 'main',
                qualifiedName: 'main',
                filePath: 'src/index.ts',
                lineStart: 1,
                lineEnd: 10,
                isAsync: false,
                isExported: true,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: '(): void',
                community: null,
                pageRank: null,
                betweenness: null,
            };
            await repo.insertFunctionNodes([fn]);
            const result = await repo.getFunctionsByFile('src/index.ts');
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('main');
        });
    });

    describe('edges', () => {
        it('inserts and queries calls edges', async () => {
            const edge: CallsEdge = {
                sourceId: 'fn:a.ts:foo',
                targetId: 'fn:b.ts:bar',
                line: 5,
                confidence: 0.95,
                isDynamic: false,
                isAsync: false,
                isIndirect: false,
                stage: 3,
                reason: 'direct call',
            };
            await repo.insertCallsEdges([edge]);
            const deps = await repo.getCallsFrom('fn:a.ts:foo');
            expect(deps).toHaveLength(1);
            expect(deps[0].targetId).toBe('fn:b.ts:bar');
        });

        it('inserts and queries contains edges', async () => {
            const edge: ContainsEdge = {
                sourceId: 'file:src/index.ts',
                targetId: 'fn:src/index.ts:main',
                confidence: 1.0,
                stage: 1,
                reason: null,
            };
            await repo.insertContainsEdges([edge]);
            const children = await repo.getContainedBy('file:src/index.ts');
            expect(children).toHaveLength(1);
        });
    });

    describe('batch operations', () => {
        it('inserts large batches in chunks', async () => {
            const fns: FunctionNode[] = Array.from({ length: 600 }, (_, i) => ({
                id: `fn:file.ts:fn${i}`,
                name: `fn${i}`,
                qualifiedName: `fn${i}`,
                filePath: 'file.ts',
                lineStart: i,
                lineEnd: i + 1,
                isAsync: false,
                isExported: false,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: null,
                community: null,
                pageRank: null,
                betweenness: null,
            }));
            await repo.insertFunctionNodes(fns);
            const result = await repo.getFunctionsByFile('file.ts');
            expect(result).toHaveLength(600);
        });
    });

    describe('file-scoped deletion', () => {
        it('deletes all nodes and edges for a file', async () => {
            await repo.insertFunctionNodes([
                {
                    id: 'fn:a.ts:foo',
                    name: 'foo',
                    qualifiedName: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                    isAsync: false,
                    isExported: false,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature: null,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
            ]);
            await repo.insertCallsEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'fn:b.ts:bar',
                    line: 3,
                    confidence: 0.9,
                    isDynamic: false,
                    isAsync: false,
                    isIndirect: false,
                    stage: 3,
                    reason: null,
                },
            ]);
            await repo.deleteFileData('a.ts');
            const fns = await repo.getFunctionsByFile('a.ts');
            expect(fns).toHaveLength(0);
            const calls = await repo.getCallsFrom('fn:a.ts:foo');
            expect(calls).toHaveLength(0);
        });
    });

    describe('type constraints', () => {
        it('inserts and retrieves type constraints by symbol', async () => {
            const constraints: TypeConstraint[] = [
                {
                    symbolId: 'var:a.ts:x',
                    typeName: 'string',
                    source: 'annotation',
                    confidence: 1.0,
                    filePath: 'a.ts',
                    line: 5,
                },
                {
                    symbolId: 'var:a.ts:x',
                    typeName: 'number',
                    source: 'assignment',
                    confidence: 0.8,
                    filePath: 'a.ts',
                    line: 10,
                },
            ];
            await repo.insertTypeConstraints(constraints);
            const result = await repo.getTypeConstraints('var:a.ts:x');
            expect(result).toHaveLength(2);
            expect(result[0].typeName).toBe('string');
            expect(result[1].typeName).toBe('number');
        });

        it('retrieves type constraints by type name', async () => {
            await repo.insertTypeConstraints([
                {
                    symbolId: 'var:a.ts:x',
                    typeName: 'string',
                    source: 'annotation',
                    confidence: 1.0,
                    filePath: 'a.ts',
                    line: 5,
                },
                {
                    symbolId: 'var:b.ts:y',
                    typeName: 'string',
                    source: 'return_type',
                    confidence: 0.9,
                    filePath: 'b.ts',
                    line: 12,
                },
            ]);
            const result = await repo.getTypeConstraintsByType('string');
            expect(result).toHaveLength(2);
        });

        it('deduplicates on (symbolId, typeName, source)', async () => {
            const constraint: TypeConstraint = {
                symbolId: 'var:a.ts:x',
                typeName: 'string',
                source: 'annotation',
                confidence: 1.0,
                filePath: 'a.ts',
                line: 5,
            };
            await repo.insertTypeConstraints([constraint]);
            await repo.insertTypeConstraints([constraint]);
            const result = await repo.getTypeConstraints('var:a.ts:x');
            expect(result).toHaveLength(1);
        });

        it('deletes constraints for a file', async () => {
            await repo.insertTypeConstraints([
                {
                    symbolId: 'var:a.ts:x',
                    typeName: 'string',
                    source: 'annotation',
                    confidence: 1.0,
                    filePath: 'a.ts',
                    line: 5,
                },
            ]);
            await repo.deleteTypeConstraintsForFile('a.ts');
            const result = await repo.getTypeConstraints('var:a.ts:x');
            expect(result).toHaveLength(0);
        });
    });

    describe('generic instantiations', () => {
        it('inserts and retrieves generic instantiations', async () => {
            const insts: GenericInstantiation[] = [
                {
                    symbolId: 'var:a.ts:list',
                    genericName: 'Array',
                    typeArguments: ['string'],
                    filePath: 'a.ts',
                    line: 3,
                },
                {
                    symbolId: 'var:a.ts:map',
                    genericName: 'Map',
                    typeArguments: ['string', 'number'],
                    filePath: 'a.ts',
                    line: 4,
                },
            ];
            await repo.insertGenericInstantiations(insts);
            const result = await repo.getGenericInstantiations('var:a.ts:list');
            expect(result).toHaveLength(1);
            expect(result[0].genericName).toBe('Array');
            expect(result[0].typeArguments).toEqual(['string']);
        });

        it('deletes instantiations for a file', async () => {
            await repo.insertGenericInstantiations([
                {
                    symbolId: 'var:a.ts:list',
                    genericName: 'Array',
                    typeArguments: ['string'],
                    filePath: 'a.ts',
                    line: 3,
                },
            ]);
            await repo.deleteGenericInstantiationsForFile('a.ts');
            const result = await repo.getGenericInstantiations('var:a.ts:list');
            expect(result).toHaveLength(0);
        });
    });

    describe('flow edges', () => {
        it('queries flows_to edges by source and target', async () => {
            await repo.insertFlowsToEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'fn:b.ts:bar',
                    parameterIndex: 0,
                    transform: 'passthrough',
                    taintLabel: null,
                    confidence: 0.9,
                    stage: 5,
                    reason: 'param flow',
                },
            ]);
            const from = await repo.getFlowsFrom('fn:a.ts:foo');
            expect(from).toHaveLength(1);
            expect(from[0].targetId).toBe('fn:b.ts:bar');
            expect(from[0].transform).toBe('passthrough');

            const to = await repo.getFlowsTo('fn:b.ts:bar');
            expect(to).toHaveLength(1);
            expect(to[0].sourceId).toBe('fn:a.ts:foo');
        });

        it('queries reads edges by source and target', async () => {
            await repo.insertReadsEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'var:a.ts:x',
                    line: 5,
                    field: 'length',
                    confidence: 0.9,
                    stage: 5,
                    reason: null,
                },
            ]);
            const from = await repo.getReadsFrom('fn:a.ts:foo');
            expect(from).toHaveLength(1);
            expect(from[0].field).toBe('length');

            const of = await repo.getReadsOf('var:a.ts:x');
            expect(of).toHaveLength(1);
        });

        it('queries writes edges by source and target', async () => {
            await repo.insertWritesEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'var:a.ts:x',
                    line: 8,
                    field: null,
                    confidence: 0.9,
                    stage: 5,
                    reason: null,
                },
            ]);
            const from = await repo.getWritesFrom('fn:a.ts:foo');
            expect(from).toHaveLength(1);

            const to = await repo.getWritesTo('var:a.ts:x');
            expect(to).toHaveLength(1);
        });

        it('queries returns edges by source and target', async () => {
            await repo.insertReturnsEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'type:a.ts:Result',
                    line: 15,
                    returnType: 'Result',
                    confidence: 0.85,
                    stage: 5,
                    reason: null,
                },
            ]);
            const from = await repo.getReturnsFrom('fn:a.ts:foo');
            expect(from).toHaveLength(1);
            expect(from[0].returnType).toBe('Result');

            const to = await repo.getReturnsTo('type:a.ts:Result');
            expect(to).toHaveLength(1);
        });

        it('deletes flow edges for a file', async () => {
            await repo.insertFunctionNodes([
                {
                    id: 'fn:a.ts:foo',
                    name: 'foo',
                    qualifiedName: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 20,
                    isAsync: false,
                    isExported: false,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature: null,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
            ]);
            await repo.insertFlowsToEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'fn:b.ts:bar',
                    parameterIndex: 0,
                    transform: 'passthrough',
                    taintLabel: null,
                    confidence: 0.9,
                    stage: 5,
                    reason: null,
                },
            ]);
            await repo.deleteFlowEdgesForFile('a.ts');
            const flows = await repo.getFlowsFrom('fn:a.ts:foo');
            expect(flows).toHaveLength(0);
        });
    });

    describe('call graph refinement', () => {
        it('updates call edge confidence', async () => {
            await repo.insertCallsEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'fn:b.ts:bar',
                    line: 5,
                    confidence: 0.5,
                    isDynamic: true,
                    isAsync: false,
                    isIndirect: true,
                    stage: 3,
                    reason: 'heuristic',
                },
            ]);
            await repo.updateCallEdgeConfidence(
                'fn:a.ts:foo',
                'fn:b.ts:bar',
                0.95,
                'type-confirmed',
            );
            const calls = await repo.getCallsFrom('fn:a.ts:foo');
            expect(calls[0].confidence).toBeCloseTo(0.95, 2);
            expect(calls[0].reason).toBe('type-confirmed');
        });
    });

    describe('entry point scoring', () => {
        it('updates entry point score on function node', async () => {
            await repo.insertFunctionNodes([
                {
                    id: 'fn:a.ts:main',
                    name: 'main',
                    qualifiedName: 'main',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 10,
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
            await repo.updateEntryPointScore('fn:a.ts:main', 0.95, true);
            const fns = await repo.getFunctionsByFile('a.ts');
            expect(fns[0].entryPointScore).toBeCloseTo(0.95, 2);
            expect(fns[0].isEntryPoint).toBe(true);
        });
    });

    describe('variable inferred type', () => {
        it('updates inferred type on variable node', async () => {
            await repo.insertVariableNodes([
                {
                    id: 'var:a.ts:x',
                    name: 'x',
                    scope: 'module',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 1,
                    isExported: false,
                    inferredType: null,
                },
            ]);
            await repo.updateVariableType('var:a.ts:x', 'string');
            const vars = await repo.getVariablesByFile('a.ts');
            expect(vars[0].inferredType).toBe('string');
        });
    });

    describe('implementations query', () => {
        it('gets implementors of an interface', async () => {
            await repo.insertImplementsEdges([
                {
                    sourceId: 'class:a.ts:Foo',
                    targetId: 'iface:a.ts:IFoo',
                    line: 1,
                    confidence: 1.0,
                    stage: 3,
                    reason: null,
                },
                {
                    sourceId: 'class:b.ts:Bar',
                    targetId: 'iface:a.ts:IFoo',
                    line: 1,
                    confidence: 1.0,
                    stage: 3,
                    reason: null,
                },
            ]);
            const impls = await repo.getImplementorsOf('iface:a.ts:IFoo');
            expect(impls).toHaveLength(2);
        });
    });

    describe('stage edge deletion', () => {
        it('deletes all edges for a stage', async () => {
            await repo.insertCallsEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'fn:b.ts:bar',
                    line: 5,
                    confidence: 0.9,
                    isDynamic: false,
                    isAsync: false,
                    isIndirect: false,
                    stage: 4,
                    reason: null,
                },
                {
                    sourceId: 'fn:c.ts:baz',
                    targetId: 'fn:d.ts:qux',
                    line: 10,
                    confidence: 0.9,
                    isDynamic: false,
                    isAsync: false,
                    isIndirect: false,
                    stage: 3,
                    reason: null,
                },
            ]);
            await repo.deleteStageEdges(4);
            const calls4 = await repo.getCallsFrom('fn:a.ts:foo');
            expect(calls4).toHaveLength(0);
            const calls3 = await repo.getCallsFrom('fn:c.ts:baz');
            expect(calls3).toHaveLength(1);
        });

        it('deletes stage edges scoped to a file', async () => {
            await repo.insertFunctionNodes([
                {
                    id: 'fn:a.ts:foo',
                    name: 'foo',
                    qualifiedName: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                    isAsync: false,
                    isExported: false,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature: null,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
            ]);
            await repo.insertCallsEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'fn:b.ts:bar',
                    line: 3,
                    confidence: 0.9,
                    isDynamic: false,
                    isAsync: false,
                    isIndirect: false,
                    stage: 4,
                    reason: null,
                },
                {
                    sourceId: 'fn:c.ts:baz',
                    targetId: 'fn:d.ts:qux',
                    line: 10,
                    confidence: 0.9,
                    isDynamic: false,
                    isAsync: false,
                    isIndirect: false,
                    stage: 4,
                    reason: null,
                },
            ]);
            await repo.deleteStageEdges(4, 'a.ts');
            const callsA = await repo.getCallsFrom('fn:a.ts:foo');
            expect(callsA).toHaveLength(0);
            const callsC = await repo.getCallsFrom('fn:c.ts:baz');
            expect(callsC).toHaveLength(1);
        });
    });

    describe('stats', () => {
        it('returns node and edge counts including new tables', async () => {
            await repo.insertFunctionNodes([
                {
                    id: 'fn:a.ts:foo',
                    name: 'foo',
                    qualifiedName: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                    isAsync: false,
                    isExported: false,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature: null,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                },
            ]);
            await repo.insertFlowsToEdges([
                {
                    sourceId: 'fn:a.ts:foo',
                    targetId: 'fn:b.ts:bar',
                    parameterIndex: 0,
                    transform: 'passthrough',
                    taintLabel: null,
                    confidence: 0.9,
                    stage: 5,
                    reason: null,
                },
            ]);
            await repo.insertTypeConstraints([
                {
                    symbolId: 'var:a.ts:x',
                    typeName: 'string',
                    source: 'annotation',
                    confidence: 1.0,
                    filePath: 'a.ts',
                    line: 1,
                },
            ]);
            await repo.insertGenericInstantiations([
                {
                    symbolId: 'var:a.ts:list',
                    genericName: 'Array',
                    typeArguments: ['string'],
                    filePath: 'a.ts',
                    line: 2,
                },
            ]);
            const stats = await repo.getStats();
            expect(stats.functions).toBe(1);
            expect(stats.flowsTo).toBe(1);
            expect(stats.typeConstraints).toBe(1);
            expect(stats.genericInstantiations).toBe(1);
        });
    });
});
