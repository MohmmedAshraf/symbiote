import { describe, it, expect, beforeEach } from 'vitest';
import Graph from 'graphology';
import { ImpactAnalyzer } from '../../src/core/impact.js';
import type { ImpactEntry } from '../../src/core/impact.js';

function buildTestGraph(): Graph {
    const g = new Graph({ type: 'directed', multi: true });

    g.addNode('fn:auth.ts:handleAuth', {
        type: 'function',
        name: 'handleAuth',
        filePath: 'src/auth.ts',
        lineStart: 1,
        lineEnd: 20,
    });
    g.addNode('fn:token.ts:validateToken', {
        type: 'function',
        name: 'validateToken',
        filePath: 'src/token.ts',
        lineStart: 1,
        lineEnd: 10,
    });
    g.addNode('fn:user.ts:fetchUser', {
        type: 'function',
        name: 'fetchUser',
        filePath: 'src/user.ts',
        lineStart: 1,
        lineEnd: 15,
    });
    g.addNode('fn:email.ts:sendEmail', {
        type: 'function',
        name: 'sendEmail',
        filePath: 'src/email.ts',
        lineStart: 1,
        lineEnd: 8,
    });
    g.addNode('fn:api.ts:handler', {
        type: 'function',
        name: 'handler',
        filePath: 'src/api.ts',
        lineStart: 1,
        lineEnd: 30,
    });
    g.addNode('file:src/utils.ts', {
        type: 'file',
        name: 'utils.ts',
        filePath: 'src/utils.ts',
        lineStart: 1,
        lineEnd: 50,
    });
    g.addNode('fn:utils.ts:format', {
        type: 'function',
        name: 'format',
        filePath: 'src/utils.ts',
        lineStart: 5,
        lineEnd: 10,
    });

    g.addEdge('fn:auth.ts:handleAuth', 'fn:token.ts:validateToken', { type: 'calls' });
    g.addEdge('fn:auth.ts:handleAuth', 'fn:user.ts:fetchUser', { type: 'calls' });
    g.addEdge('fn:user.ts:fetchUser', 'fn:email.ts:sendEmail', { type: 'calls' });
    g.addEdge('fn:api.ts:handler', 'fn:auth.ts:handleAuth', { type: 'calls' });
    g.addEdge('fn:api.ts:handler', 'file:src/utils.ts', { type: 'imports' });
    g.addEdge('file:src/utils.ts', 'fn:utils.ts:format', { type: 'contains' });

    return g;
}

describe('ImpactAnalyzer', () => {
    let graph: Graph;
    let analyzer: ImpactAnalyzer;

    beforeEach(() => {
        graph = buildTestGraph();
        analyzer = new ImpactAnalyzer(graph);
    });

    describe('getBlastRadius', () => {
        it('returns source node at depth 0', () => {
            const result = analyzer.getBlastRadius('fn:token.ts:validateToken', 3);
            expect(result.depths[0]).toHaveLength(1);
            expect(result.depths[0][0].node).toBe('fn:token.ts:validateToken');
        });

        it('finds direct dependents at depth 1', () => {
            const result = analyzer.getBlastRadius('fn:token.ts:validateToken', 3);
            const depth1Nodes = result.depths[1].map((e: ImpactEntry) => e.node);
            expect(depth1Nodes).toContain('fn:auth.ts:handleAuth');
        });

        it('finds transitive dependents at depth 2', () => {
            const result = analyzer.getBlastRadius('fn:token.ts:validateToken', 3);
            const depth2Nodes = result.depths[2].map((e: ImpactEntry) => e.node);
            expect(depth2Nodes).toContain('fn:api.ts:handler');
        });

        it('computes compound confidence along path', () => {
            const result = analyzer.getBlastRadius('fn:token.ts:validateToken', 3);
            const handlerEntry = result.depths[2].find(
                (e: ImpactEntry) => e.node === 'fn:api.ts:handler',
            );
            expect(handlerEntry).toBeDefined();
            expect(handlerEntry!.confidence).toBeCloseTo(0.81, 2);
        });

        it('includes the path from source to each affected node', () => {
            const result = analyzer.getBlastRadius('fn:token.ts:validateToken', 3);
            const handlerEntry = result.depths[2].find(
                (e: ImpactEntry) => e.node === 'fn:api.ts:handler',
            );
            expect(handlerEntry!.path).toEqual([
                'fn:token.ts:validateToken',
                'fn:auth.ts:handleAuth',
                'fn:api.ts:handler',
            ]);
        });

        it('respects maxDepth limit', () => {
            const result = analyzer.getBlastRadius('fn:email.ts:sendEmail', 1);
            expect(result.depths[1]).toBeDefined();
            expect(result.depths[2]).toBeUndefined();
        });

        it('assigns confidence per edge type', () => {
            const result = analyzer.getBlastRadius('file:src/utils.ts', 2);
            const handlerEntry = result.depths[1].find(
                (e: ImpactEntry) => e.node === 'fn:api.ts:handler',
            );
            expect(handlerEntry).toBeDefined();
            expect(handlerEntry!.confidence).toBeCloseTo(0.7, 2);
        });

        it('does not revisit nodes (handles cycles)', () => {
            graph.addEdge('fn:email.ts:sendEmail', 'fn:auth.ts:handleAuth', { type: 'calls' });
            const result = analyzer.getBlastRadius('fn:email.ts:sendEmail', 5);
            const allNodes = Object.values(result.depths)
                .flat()
                .map((e: ImpactEntry) => e.node);
            const unique = new Set(allNodes);
            expect(allNodes.length).toBe(unique.size);
        });

        it('returns empty depths for a node with no dependents', () => {
            const result = analyzer.getBlastRadius('fn:api.ts:handler', 3);
            expect(result.depths[0]).toHaveLength(1);
            expect(result.depths[1] ?? []).toHaveLength(0);
        });
    });

    describe('summary', () => {
        it('computes totalAffected count', () => {
            const result = analyzer.getBlastRadius('fn:token.ts:validateToken', 3);
            expect(result.summary.totalAffected).toBeGreaterThanOrEqual(2);
        });

        it('sets riskLevel HIGH when critical path confidence > 0.7', () => {
            const result = analyzer.getBlastRadius('fn:token.ts:validateToken', 3);
            expect(result.summary.riskLevel).toBe('HIGH');
        });

        it('sets riskLevel LOW when no high-confidence paths', () => {
            graph.addNode('fn:config.ts:getConfig', {
                type: 'function',
                name: 'getConfig',
                filePath: 'src/config.ts',
                lineStart: 1,
                lineEnd: 5,
            });
            graph.addNode('fn:log.ts:log', {
                type: 'function',
                name: 'log',
                filePath: 'src/log.ts',
                lineStart: 1,
                lineEnd: 3,
            });
            graph.addEdge('fn:log.ts:log', 'fn:config.ts:getConfig', { type: 'references' });

            const result = analyzer.getBlastRadius('fn:config.ts:getConfig', 1);
            expect(result.summary.riskLevel).toBe('LOW');
        });
    });
});
