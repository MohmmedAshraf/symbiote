import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { Repository } from '#storage/repository.js';
import { GraphQuery } from '#core/graph.js';

describe('GraphQuery', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let graph: GraphQuery;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
        graph = new GraphQuery(repo);

        await repo.insertNodes([
            {
                id: 'fn:a:foo',
                type: 'function',
                name: 'foo',
                filePath: 'a.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:b:bar',
                type: 'function',
                name: 'bar',
                filePath: 'b.ts',
                lineStart: 1,
                lineEnd: 3,
            },
            {
                id: 'fn:a:baz',
                type: 'function',
                name: 'baz',
                filePath: 'a.ts',
                lineStart: 7,
                lineEnd: 10,
            },
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a:foo', targetId: 'fn:b:bar', type: 'calls' },
            { sourceId: 'fn:a:baz', targetId: 'fn:b:bar', type: 'calls' },
        ]);
    });

    afterEach(async () => {
        await db.close();
    });

    it('gets dependencies for a node', async () => {
        const deps = await graph.getDependencies('fn:a:foo');
        expect(deps).toHaveLength(1);
        expect(deps[0].name).toBe('bar');
    });

    it('gets dependents for a node', async () => {
        const deps = await graph.getDependents('fn:b:bar');
        expect(deps).toHaveLength(2);
    });

    it('searches nodes by name', async () => {
        const results = await graph.searchNodes('foo');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('fn:a:foo');
    });

    it('gets file context', async () => {
        const ctx = await graph.getFileContext('a.ts');
        expect(ctx.nodes).toHaveLength(2);
        expect(ctx.dependencies.length).toBeGreaterThan(0);
    });

    it('gets project overview', async () => {
        const overview = await graph.getOverview();
        expect(overview.totalNodes).toBe(3);
        expect(overview.totalEdges).toBe(2);
    });
});
