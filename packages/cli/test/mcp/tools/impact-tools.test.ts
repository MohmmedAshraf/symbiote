import { describe, it, expect, beforeEach } from 'vitest';
import Graph from 'graphology';
import { ImpactAnalyzer } from '../../../src/core/impact.js';
import { handleGetImpact } from '../../../src/mcp/tools/impact-tools.js';
import type { ImpactToolContext } from '../../../src/mcp/tools/impact-tools.js';

function buildGraph(): Graph {
    const g = new Graph({ type: 'directed', multi: true });

    g.addNode('fn:auth.ts:login', {
        type: 'function',
        name: 'login',
        filePath: 'src/auth.ts',
        lineStart: 1,
        lineEnd: 10,
    });
    g.addNode('fn:db.ts:query', {
        type: 'function',
        name: 'query',
        filePath: 'src/db.ts',
        lineStart: 1,
        lineEnd: 5,
    });
    g.addNode('fn:api.ts:handler', {
        type: 'function',
        name: 'handler',
        filePath: 'src/api.ts',
        lineStart: 1,
        lineEnd: 20,
    });

    g.addEdge('fn:auth.ts:login', 'fn:db.ts:query', { type: 'calls' });
    g.addEdge('fn:api.ts:handler', 'fn:auth.ts:login', { type: 'calls' });

    return g;
}

describe('handleGetImpact', () => {
    let ctx: ImpactToolContext;

    beforeEach(() => {
        const graph = buildGraph();
        ctx = {
            graph,
            impact: new ImpactAnalyzer(graph),
        };
    });

    it('returns impact result for a valid target', () => {
        const result = handleGetImpact(ctx, {
            target: 'fn:db.ts:query',
        });
        expect(result.summary.totalAffected).toBeGreaterThanOrEqual(1);
        expect(result.depths[1]).toBeDefined();
    });

    it('uses default maxDepth of 3', () => {
        const result = handleGetImpact(ctx, {
            target: 'fn:db.ts:query',
        });
        expect(result.depths[0]).toHaveLength(1);
    });

    it('respects custom maxDepth', () => {
        const result = handleGetImpact(ctx, {
            target: 'fn:db.ts:query',
            maxDepth: 1,
        });
        expect(result.depths[2]).toBeUndefined();
    });

    it('returns empty result for unknown node', () => {
        const result = handleGetImpact(ctx, {
            target: 'fn:unknown:missing',
        });
        expect(result.summary.totalAffected).toBe(0);
    });
});
