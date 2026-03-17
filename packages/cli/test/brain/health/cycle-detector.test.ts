import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../../src/storage/db.js';
import { Repository } from '../../../src/storage/repository.js';
import { CycleDetector } from '../../../src/brain/health/cycle-detector.js';

describe('CycleDetector', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let detector: CycleDetector;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
        detector = new CycleDetector(repo);
    });

    afterEach(async () => {
        await db.close();
    });

    it('returns empty array when there are no cycles', async () => {
        await repo.insertNodes([
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
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a.ts:foo', targetId: 'fn:b.ts:bar', type: 'calls' },
        ]);

        const cycles = await detector.detect();
        expect(cycles).toEqual([]);
    });

    it('detects a simple A -> B -> A cycle', async () => {
        await repo.insertNodes([
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
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a.ts:foo', targetId: 'fn:b.ts:bar', type: 'calls' },
            { sourceId: 'fn:b.ts:bar', targetId: 'fn:a.ts:foo', type: 'calls' },
        ]);

        const cycles = await detector.detect();
        expect(cycles.length).toBe(1);
        expect(cycles[0].chain.length).toBeGreaterThanOrEqual(2);
        expect(cycles[0].filePaths).toContain('a.ts');
        expect(cycles[0].filePaths).toContain('b.ts');
    });

    it('detects a three-node cycle A -> B -> C -> A', async () => {
        await repo.insertNodes([
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
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a.ts:a', targetId: 'fn:b.ts:b', type: 'calls' },
            { sourceId: 'fn:b.ts:b', targetId: 'fn:c.ts:c', type: 'calls' },
            { sourceId: 'fn:c.ts:c', targetId: 'fn:a.ts:a', type: 'calls' },
        ]);

        const cycles = await detector.detect();
        expect(cycles.length).toBe(1);
        expect(cycles[0].chain).toEqual(
            expect.arrayContaining(['fn:a.ts:a', 'fn:b.ts:b', 'fn:c.ts:c']),
        );
        expect(cycles[0].filePaths).toEqual(expect.arrayContaining(['a.ts', 'b.ts', 'c.ts']));
    });

    it('ignores self-loops within the same file', async () => {
        await repo.insertNodes([
            {
                id: 'fn:a.ts:recursive',
                type: 'function',
                name: 'recursive',
                filePath: 'a.ts',
                lineStart: 1,
                lineEnd: 5,
            },
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a.ts:recursive', targetId: 'fn:a.ts:recursive', type: 'calls' },
        ]);

        const cycles = await detector.detect();
        expect(cycles).toEqual([]);
    });

    it('ignores cycles within the same file', async () => {
        await repo.insertNodes([
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
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a.ts:foo', targetId: 'fn:a.ts:bar', type: 'calls' },
            { sourceId: 'fn:a.ts:bar', targetId: 'fn:a.ts:foo', type: 'calls' },
        ]);

        const cycles = await detector.detect();
        expect(cycles).toEqual([]);
    });

    it('returns empty array when graph has no edges', async () => {
        await repo.insertNodes([
            {
                id: 'fn:a.ts:foo',
                type: 'function',
                name: 'foo',
                filePath: 'a.ts',
                lineStart: 1,
                lineEnd: 3,
            },
        ]);

        const cycles = await detector.detect();
        expect(cycles).toEqual([]);
    });
});
