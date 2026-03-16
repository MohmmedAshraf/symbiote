import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../src/storage/db.js';
import { Repository } from '../../src/storage/repository.js';

describe('Repository', () => {
    let db: SymbioteDB;
    let repo: Repository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new Repository(db);
    });

    afterEach(() => {
        db.close();
    });

    describe('files', () => {
        it('upserts and retrieves a file record', () => {
            repo.upsertFile('src/index.ts', 'abc123');
            const file = repo.getFile('src/index.ts');
            expect(file).toBeDefined();
            expect(file!.hash).toBe('abc123');
        });

        it('detects changed files by hash', () => {
            repo.upsertFile('src/index.ts', 'abc123');
            expect(repo.isFileChanged('src/index.ts', 'abc123')).toBe(false);
            expect(repo.isFileChanged('src/index.ts', 'def456')).toBe(true);
            expect(repo.isFileChanged('src/new.ts', 'abc123')).toBe(true);
        });
    });

    describe('nodes', () => {
        it('inserts and retrieves nodes', () => {
            repo.insertNodes([
                {
                    id: 'fn:src/index.ts:greet',
                    type: 'function',
                    name: 'greet',
                    filePath: 'src/index.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ]);

            const nodes = repo.getNodesByFile('src/index.ts');
            expect(nodes).toHaveLength(1);
            expect(nodes[0].name).toBe('greet');
        });

        it('clears nodes for a file before reinserting', () => {
            repo.insertNodes([
                {
                    id: 'fn:src/index.ts:greet',
                    type: 'function',
                    name: 'greet',
                    filePath: 'src/index.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ]);

            repo.clearNodesForFile('src/index.ts');
            const nodes = repo.getNodesByFile('src/index.ts');
            expect(nodes).toHaveLength(0);
        });
    });

    describe('edges', () => {
        it('inserts and retrieves edges', () => {
            repo.insertNodes([
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

            repo.insertEdges([
                { sourceId: 'fn:a:foo', targetId: 'fn:b:bar', type: 'calls' },
            ]);

            const deps = repo.getDependencies('fn:a:foo');
            expect(deps).toHaveLength(1);
            expect(deps[0].targetId).toBe('fn:b:bar');

            const dependents = repo.getDependents('fn:b:bar');
            expect(dependents).toHaveLength(1);
            expect(dependents[0].sourceId).toBe('fn:a:foo');
        });
    });

    describe('stats', () => {
        it('returns node and edge counts', () => {
            repo.insertNodes([
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

            repo.insertEdges([
                { sourceId: 'fn:a:foo', targetId: 'fn:b:bar', type: 'calls' },
            ]);

            const stats = repo.getStats();
            expect(stats.nodes).toBe(2);
            expect(stats.edges).toBe(1);
            expect(stats.files).toBe(0);
        });
    });
});
