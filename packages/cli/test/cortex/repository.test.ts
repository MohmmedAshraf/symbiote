import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import type { FunctionNode, ClassNode, CallsEdge, ContainsEdge } from '../../src/cortex/types.js';

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

    describe('stats', () => {
        it('returns node and edge counts', async () => {
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
            const stats = await repo.getStats();
            expect(stats.functions).toBe(1);
        });
    });
});
