import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../src/storage/db.js';
import { Repository } from '../../src/storage/repository.js';

describe('Repository', () => {
    let db: SymbioteDB;
    let repo: Repository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
    });

    afterEach(async () => {
        await db.close();
    });

    describe('files', () => {
        it('upserts and retrieves a file record', async () => {
            await repo.upsertFile('src/index.ts', 'abc123');
            const file = await repo.getFile('src/index.ts');
            expect(file).toBeDefined();
            expect(file!.hash).toBe('abc123');
        });

        it('detects changed files by hash', async () => {
            await repo.upsertFile('src/index.ts', 'abc123');
            expect(await repo.isFileChanged('src/index.ts', 'abc123')).toBe(false);
            expect(await repo.isFileChanged('src/index.ts', 'def456')).toBe(true);
            expect(await repo.isFileChanged('src/new.ts', 'abc123')).toBe(true);
        });
    });

    describe('nodes', () => {
        it('inserts and retrieves nodes', async () => {
            await repo.insertNodes([
                {
                    id: 'fn:src/index.ts:greet',
                    type: 'function',
                    name: 'greet',
                    filePath: 'src/index.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ]);

            const nodes = await repo.getNodesByFile('src/index.ts');
            expect(nodes).toHaveLength(1);
            expect(nodes[0].name).toBe('greet');
        });

        it('clears nodes for a file before reinserting', async () => {
            await repo.insertNodes([
                {
                    id: 'fn:src/index.ts:greet',
                    type: 'function',
                    name: 'greet',
                    filePath: 'src/index.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ]);

            await repo.clearNodesForFile('src/index.ts');
            const nodes = await repo.getNodesByFile('src/index.ts');
            expect(nodes).toHaveLength(0);
        });

        it('searches nodes by name', async () => {
            await repo.insertNodes([
                {
                    id: 'fn:a:foo',
                    type: 'function',
                    name: 'fooBar',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ]);

            const results = await repo.searchNodesByName('foo');
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('fooBar');
        });
    });

    describe('edges', () => {
        it('inserts and retrieves edges', async () => {
            await repo.insertNodes([
                {
                    id: 'fn:a:foo',
                    type: 'function',
                    name: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:b:bar',
                    type: 'function',
                    name: 'bar',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ]);

            await repo.insertEdges([{ sourceId: 'fn:a:foo', targetId: 'fn:b:bar', type: 'calls' }]);

            const deps = await repo.getDependencies('fn:a:foo');
            expect(deps).toHaveLength(1);
            expect(deps[0].targetId).toBe('fn:b:bar');

            const dependents = await repo.getDependents('fn:b:bar');
            expect(dependents).toHaveLength(1);
            expect(dependents[0].sourceId).toBe('fn:a:foo');
        });
    });

    describe('stats', () => {
        it('returns node and edge counts', async () => {
            await repo.insertNodes([
                {
                    id: 'fn:a:foo',
                    type: 'function',
                    name: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:b:bar',
                    type: 'function',
                    name: 'bar',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ]);

            await repo.insertEdges([{ sourceId: 'fn:a:foo', targetId: 'fn:b:bar', type: 'calls' }]);

            const stats = await repo.getStats();
            expect(stats.nodes).toBe(2);
            expect(stats.edges).toBe(1);
            expect(stats.files).toBe(0);
        });
    });
});
