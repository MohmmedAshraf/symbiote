import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SynapseDB } from '../../src/storage/db.js';
import { Repository } from '../../src/storage/repository.js';
import { GraphQuery } from '../../src/core/graph.js';

describe('GraphQuery', () => {
    let db: SynapseDB;
    let repo: Repository;
    let graph: GraphQuery;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new Repository(db);
        graph = new GraphQuery(repo);

        repo.insertNodes([
            {
                id: 'fn:a.ts:handleAuth',
                type: 'function',
                name: 'handleAuth',
                filePath: 'a.ts',
                lineStart: 1,
                lineEnd: 10,
            },
            {
                id: 'fn:b.ts:validateToken',
                type: 'function',
                name: 'validateToken',
                filePath: 'b.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:c.ts:fetchUser',
                type: 'function',
                name: 'fetchUser',
                filePath: 'c.ts',
                lineStart: 1,
                lineEnd: 8,
            },
            {
                id: 'fn:d.ts:sendEmail',
                type: 'function',
                name: 'sendEmail',
                filePath: 'd.ts',
                lineStart: 1,
                lineEnd: 6,
            },
        ]);

        repo.insertEdges([
            {
                sourceId: 'fn:a.ts:handleAuth',
                targetId: 'fn:b.ts:validateToken',
                type: 'calls',
            },
            {
                sourceId: 'fn:a.ts:handleAuth',
                targetId: 'fn:c.ts:fetchUser',
                type: 'calls',
            },
            {
                sourceId: 'fn:c.ts:fetchUser',
                targetId: 'fn:d.ts:sendEmail',
                type: 'calls',
            },
        ]);
    });

    afterEach(() => {
        db.close();
    });

    it('finds direct dependencies', () => {
        const deps = graph.getDependencies('fn:a.ts:handleAuth');
        expect(deps).toHaveLength(2);
    });

    it('finds direct dependents', () => {
        const deps = graph.getDependents('fn:b.ts:validateToken');
        expect(deps).toHaveLength(1);
        expect(deps[0].id).toBe('fn:a.ts:handleAuth');
    });

    it('searches nodes by name', () => {
        const results = graph.searchNodes('auth');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].name).toContain('Auth');
    });

    it('gets context for a file', () => {
        const context = graph.getFileContext('a.ts');
        expect(context.nodes.length).toBeGreaterThanOrEqual(1);
        expect(context.dependencies.length).toBeGreaterThanOrEqual(1);
    });

    it('gets project overview stats', () => {
        const overview = graph.getOverview();
        expect(overview.totalNodes).toBe(4);
        expect(overview.totalEdges).toBe(3);
        expect(overview.nodesByType.function).toBe(4);
    });
});
