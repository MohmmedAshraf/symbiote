import { describe, it, expect, beforeEach } from 'vitest';
import Graph from 'graphology';
import { GitImpactAnalyzer } from '#core/git-impact.js';

function buildGraph(): Graph {
    const g = new Graph({ type: 'directed', multi: true });

    g.addNode('file:src/auth.ts', {
        type: 'file',
        name: 'auth.ts',
        filePath: 'src/auth.ts',
        lineStart: 1,
        lineEnd: 50,
    });
    g.addNode('fn:src/auth.ts:login', {
        type: 'function',
        name: 'login',
        filePath: 'src/auth.ts',
        lineStart: 5,
        lineEnd: 20,
    });
    g.addNode('fn:src/auth.ts:logout', {
        type: 'function',
        name: 'logout',
        filePath: 'src/auth.ts',
        lineStart: 22,
        lineEnd: 35,
    });
    g.addNode('file:src/api.ts', {
        type: 'file',
        name: 'api.ts',
        filePath: 'src/api.ts',
        lineStart: 1,
        lineEnd: 30,
    });
    g.addNode('fn:src/api.ts:handler', {
        type: 'function',
        name: 'handler',
        filePath: 'src/api.ts',
        lineStart: 1,
        lineEnd: 30,
    });
    g.addNode('file:src/db.ts', {
        type: 'file',
        name: 'db.ts',
        filePath: 'src/db.ts',
        lineStart: 1,
        lineEnd: 20,
    });
    g.addNode('fn:src/db.ts:query', {
        type: 'function',
        name: 'query',
        filePath: 'src/db.ts',
        lineStart: 1,
        lineEnd: 10,
    });

    g.addEdge('file:src/auth.ts', 'fn:src/auth.ts:login', { type: 'contains' });
    g.addEdge('file:src/auth.ts', 'fn:src/auth.ts:logout', { type: 'contains' });
    g.addEdge('file:src/api.ts', 'fn:src/api.ts:handler', { type: 'contains' });
    g.addEdge('file:src/db.ts', 'fn:src/db.ts:query', { type: 'contains' });

    g.addEdge('fn:src/auth.ts:login', 'fn:src/db.ts:query', { type: 'calls' });
    g.addEdge('fn:src/api.ts:handler', 'fn:src/auth.ts:login', { type: 'calls' });

    return g;
}

describe('GitImpactAnalyzer', () => {
    let graph: Graph;

    beforeEach(() => {
        graph = buildGraph();
    });

    describe('analyzeFiles', () => {
        it('finds symbols contained in changed files', () => {
            const analyzer = new GitImpactAnalyzer(graph);
            const result = analyzer.analyzeFiles(['src/auth.ts']);

            expect(result.changedFiles).toEqual(['src/auth.ts']);
            expect(result.affectedNodes.length).toBeGreaterThanOrEqual(1);
        });

        it('aggregates blast radius across all changed file symbols', () => {
            const analyzer = new GitImpactAnalyzer(graph);
            const result = analyzer.analyzeFiles(['src/db.ts']);

            const affectedIds = result.affectedNodes.map((n) => n.node);
            expect(affectedIds).toContain('fn:src/auth.ts:login');
        });

        it('groups affected nodes by file', () => {
            const analyzer = new GitImpactAnalyzer(graph);
            const result = analyzer.analyzeFiles(['src/db.ts']);

            expect(result.affectedFiles.length).toBeGreaterThanOrEqual(1);
            const fileNames = result.affectedFiles.map((f) => f.filePath);
            expect(fileNames).toContain('src/auth.ts');
        });

        it('computes overall risk level', () => {
            const analyzer = new GitImpactAnalyzer(graph);
            const result = analyzer.analyzeFiles(['src/db.ts']);

            expect(['HIGH', 'MEDIUM', 'LOW']).toContain(result.riskLevel);
        });

        it('returns empty result for unknown files', () => {
            const analyzer = new GitImpactAnalyzer(graph);
            const result = analyzer.analyzeFiles(['src/unknown.ts']);

            expect(result.changedFiles).toEqual(['src/unknown.ts']);
            expect(result.affectedNodes).toHaveLength(0);
        });

        it('deduplicates nodes affected by multiple changed files', () => {
            const analyzer = new GitImpactAnalyzer(graph);
            const result = analyzer.analyzeFiles(['src/auth.ts', 'src/db.ts']);

            const allNodes = result.affectedNodes.map((n) => n.node);
            const unique = new Set(allNodes);
            expect(allNodes.length).toBe(unique.size);
        });
    });

    describe('parseGitDiffOutput', () => {
        it('parses git diff output into file paths', () => {
            const files = GitImpactAnalyzer.parseGitDiffOutput('src/auth.ts\nsrc/db.ts\n');
            expect(files).toEqual(['src/auth.ts', 'src/db.ts']);
        });

        it('handles empty output', () => {
            const files = GitImpactAnalyzer.parseGitDiffOutput('');
            expect(files).toEqual([]);
        });

        it('trims whitespace and filters blank lines', () => {
            const files = GitImpactAnalyzer.parseGitDiffOutput('  src/auth.ts  \n\n  src/db.ts\n');
            expect(files).toEqual(['src/auth.ts', 'src/db.ts']);
        });
    });
});
