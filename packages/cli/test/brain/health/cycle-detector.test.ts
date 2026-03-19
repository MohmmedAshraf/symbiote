import { describe, it, expect } from 'vitest';
import { CycleDetector } from '#brain/health/cycle-detector.js';
import type { PreFetchedData } from '#brain/health/cycle-detector.js';

describe('CycleDetector', () => {
    const detector = new CycleDetector();

    it('returns empty array when there are no import cycles', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:foo',
                    type: 'function',
                    name: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:b.ts:bar',
                    type: 'function',
                    name: 'bar',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ],
            edges: [{ sourceId: 'fn:a.ts:foo', targetId: 'fn:b.ts:bar', type: 'imports' }],
        };

        const cycles = await detector.detect(data);
        expect(cycles).toEqual([]);
    });

    it('detects a simple A -> B -> A import cycle', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:foo',
                    type: 'function',
                    name: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:b.ts:bar',
                    type: 'function',
                    name: 'bar',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ],
            edges: [
                { sourceId: 'fn:a.ts:foo', targetId: 'fn:b.ts:bar', type: 'imports' },
                { sourceId: 'fn:b.ts:bar', targetId: 'fn:a.ts:foo', type: 'imports' },
            ],
        };

        const cycles = await detector.detect(data);
        expect(cycles.length).toBe(1);
        expect(cycles[0].filePaths).toContain('a.ts');
        expect(cycles[0].filePaths).toContain('b.ts');
    });

    it('detects a three-file import cycle', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:a',
                    type: 'function',
                    name: 'a',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:b.ts:b',
                    type: 'function',
                    name: 'b',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:c.ts:c',
                    type: 'function',
                    name: 'c',
                    filePath: 'c.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ],
            edges: [
                { sourceId: 'fn:a.ts:a', targetId: 'fn:b.ts:b', type: 'imports' },
                { sourceId: 'fn:b.ts:b', targetId: 'fn:c.ts:c', type: 'imports' },
                { sourceId: 'fn:c.ts:c', targetId: 'fn:a.ts:a', type: 'imports' },
            ],
        };

        const cycles = await detector.detect(data);
        expect(cycles.length).toBe(1);
        expect(cycles[0].filePaths).toEqual(expect.arrayContaining(['a.ts', 'b.ts', 'c.ts']));
    });

    it('detects cycles from call edges', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:foo',
                    type: 'function',
                    name: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:b.ts:bar',
                    type: 'function',
                    name: 'bar',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ],
            edges: [
                { sourceId: 'fn:a.ts:foo', targetId: 'fn:b.ts:bar', type: 'calls' },
                { sourceId: 'fn:b.ts:bar', targetId: 'fn:a.ts:foo', type: 'calls' },
            ],
        };

        const cycles = await detector.detect(data);
        expect(cycles.length).toBe(1);
    });

    it('ignores non-dependency edges like returns', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:foo',
                    type: 'function',
                    name: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:b.ts:bar',
                    type: 'function',
                    name: 'bar',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ],
            edges: [
                { sourceId: 'fn:a.ts:foo', targetId: 'fn:b.ts:bar', type: 'returns' },
                { sourceId: 'fn:b.ts:bar', targetId: 'fn:a.ts:foo', type: 'returns' },
            ],
        };

        const cycles = await detector.detect(data);
        expect(cycles).toEqual([]);
    });

    it('ignores same-file imports', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:foo',
                    type: 'function',
                    name: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:a.ts:bar',
                    type: 'function',
                    name: 'bar',
                    filePath: 'a.ts',
                    lineStart: 5,
                    lineEnd: 8,
                },
            ],
            edges: [
                { sourceId: 'fn:a.ts:foo', targetId: 'fn:a.ts:bar', type: 'imports' },
                { sourceId: 'fn:a.ts:bar', targetId: 'fn:a.ts:foo', type: 'imports' },
            ],
        };

        const cycles = await detector.detect(data);
        expect(cycles).toEqual([]);
    });

    it('returns empty array when graph has no edges', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:foo',
                    type: 'function',
                    name: 'foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ],
            edges: [],
        };

        const cycles = await detector.detect(data);
        expect(cycles).toEqual([]);
    });

    it('reports file paths as the cycle chain', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:x.ts:a',
                    type: 'function',
                    name: 'a',
                    filePath: 'x.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'fn:y.ts:b',
                    type: 'function',
                    name: 'b',
                    filePath: 'y.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ],
            edges: [
                { sourceId: 'fn:x.ts:a', targetId: 'fn:y.ts:b', type: 'imports' },
                { sourceId: 'fn:y.ts:b', targetId: 'fn:x.ts:a', type: 'imports' },
            ],
        };

        const cycles = await detector.detect(data);
        expect(cycles.length).toBe(1);
        expect(cycles[0].chain).toEqual(expect.arrayContaining(['x.ts', 'y.ts']));
        expect(cycles[0].filePaths).toEqual(cycles[0].chain);
    });
});
