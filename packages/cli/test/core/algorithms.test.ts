import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../src/storage/db.js';
import { Repository } from '../../src/storage/repository.js';
import { GraphAlgorithms } from '../../src/core/algorithms.js';

describe('GraphAlgorithms', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let algorithms: GraphAlgorithms;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
        algorithms = new GraphAlgorithms(repo);

        await repo.insertNodes([
            { id: 'fn:a:foo', type: 'function', name: 'foo', filePath: 'a.ts', lineStart: 1, lineEnd: 5 },
            { id: 'fn:a:bar', type: 'function', name: 'bar', filePath: 'a.ts', lineStart: 7, lineEnd: 10 },
            { id: 'fn:b:baz', type: 'function', name: 'baz', filePath: 'b.ts', lineStart: 1, lineEnd: 3 },
            { id: 'fn:b:qux', type: 'function', name: 'qux', filePath: 'b.ts', lineStart: 5, lineEnd: 8 },
            { id: 'fn:c:solo', type: 'function', name: 'solo', filePath: 'c.ts', lineStart: 1, lineEnd: 3 },
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a:foo', targetId: 'fn:a:bar', type: 'calls' },
            { sourceId: 'fn:a:bar', targetId: 'fn:b:baz', type: 'calls' },
            { sourceId: 'fn:b:baz', targetId: 'fn:b:qux', type: 'calls' },
            { sourceId: 'fn:b:qux', targetId: 'fn:a:foo', type: 'calls' },
        ]);
    });

    afterEach(async () => {
        await db.close();
    });

    describe('loadGraph', () => {
        it('loads all nodes and edges into graphology', async () => {
            const graph = await algorithms.loadGraph();
            expect(graph.order).toBe(5);
            expect(graph.size).toBe(4);
        });

        it('preserves node attributes', async () => {
            const graph = await algorithms.loadGraph();
            const attrs = graph.getNodeAttributes('fn:a:foo');
            expect(attrs.type).toBe('function');
            expect(attrs.name).toBe('foo');
            expect(attrs.filePath).toBe('a.ts');
        });
    });

    describe('runLouvain', () => {
        it('assigns community IDs to nodes', async () => {
            const result = await algorithms.runLouvain();
            expect(Object.keys(result).length).toBeGreaterThan(0);

            for (const communityId of Object.values(result)) {
                expect(typeof communityId).toBe('number');
            }
        });
    });

    describe('runPageRank', () => {
        it('assigns rank scores to nodes', async () => {
            const result = await algorithms.runPageRank();
            expect(Object.keys(result).length).toBe(5);

            for (const score of Object.values(result)) {
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(1);
            }
        });
    });

    describe('runBetweennessCentrality', () => {
        it('assigns centrality scores to nodes', async () => {
            const result = await algorithms.runBetweennessCentrality();
            expect(Object.keys(result).length).toBe(5);

            for (const score of Object.values(result)) {
                expect(typeof score).toBe('number');
                expect(score).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('runAll', () => {
        it('runs all algorithms and persists results to node metadata', async () => {
            await algorithms.runAll();

            const node = await repo.getNodeById('fn:a:foo');
            expect(node).toBeDefined();
            expect(node!.metadata).toBeDefined();
            expect(typeof node!.metadata!.community).toBe('number');
            expect(typeof node!.metadata!.pageRank).toBe('number');
            expect(typeof node!.metadata!.betweenness).toBe('number');
        });

        it('persists results for all nodes', async () => {
            await algorithms.runAll();

            const allNodes = await repo.getAllNodes();
            for (const node of allNodes) {
                expect(node.metadata).toHaveProperty('community');
                expect(node.metadata).toHaveProperty('pageRank');
                expect(node.metadata).toHaveProperty('betweenness');
            }
        });
    });
});
