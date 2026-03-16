import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../../src/storage/db.js';
import { Repository } from '../../../src/storage/repository.js';
import { DeadCodeDetector } from '../../../src/brain/health/dead-code-detector.js';

describe('DeadCodeDetector', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let detector: DeadCodeDetector;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
        detector = new DeadCodeDetector(repo);
    });

    afterEach(async () => {
        await db.close();
    });

    it('returns empty array when all functions are referenced', async () => {
        await repo.insertNodes([
            { id: 'fn:a.ts:main', type: 'function', name: 'main', filePath: 'a.ts', lineStart: 1, lineEnd: 5 },
            { id: 'fn:b.ts:helper', type: 'function', name: 'helper', filePath: 'b.ts', lineStart: 1, lineEnd: 3 },
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a.ts:main', targetId: 'fn:b.ts:helper', type: 'calls' },
            { sourceId: 'fn:b.ts:helper', targetId: 'fn:a.ts:main', type: 'calls' },
        ]);

        const dead = await detector.detect();
        expect(dead).toEqual([]);
    });

    it('detects functions with zero dependents', async () => {
        await repo.insertNodes([
            { id: 'fn:a.ts:main', type: 'function', name: 'main', filePath: 'a.ts', lineStart: 1, lineEnd: 5 },
            { id: 'fn:b.ts:helper', type: 'function', name: 'helper', filePath: 'b.ts', lineStart: 1, lineEnd: 3 },
            { id: 'fn:c.ts:orphan', type: 'function', name: 'orphan', filePath: 'c.ts', lineStart: 1, lineEnd: 3 },
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a.ts:main', targetId: 'fn:b.ts:helper', type: 'calls' },
        ]);

        const dead = await detector.detect();
        expect(dead.length).toBe(2);
        const deadNames = dead.map((d) => d.node.name);
        expect(deadNames).toContain('main');
        expect(deadNames).toContain('orphan');
    });

    it('excludes entry point files from dead code', async () => {
        await repo.insertNodes([
            { id: 'fn:index.ts:main', type: 'function', name: 'main', filePath: 'index.ts', lineStart: 1, lineEnd: 5 },
            { id: 'fn:main.ts:run', type: 'function', name: 'run', filePath: 'main.ts', lineStart: 1, lineEnd: 5 },
            { id: 'fn:app.ts:start', type: 'function', name: 'start', filePath: 'app.ts', lineStart: 1, lineEnd: 5 },
        ]);

        const dead = await detector.detect();
        const deadFiles = dead.map((d) => d.node.filePath);
        expect(deadFiles).not.toContain('index.ts');
        expect(deadFiles).not.toContain('main.ts');
        expect(deadFiles).not.toContain('app.ts');
    });

    it('detects unreferenced classes', async () => {
        await repo.insertNodes([
            { id: 'cls:a.ts:Foo', type: 'class', name: 'Foo', filePath: 'a.ts', lineStart: 1, lineEnd: 10 },
            { id: 'cls:b.ts:Bar', type: 'class', name: 'Bar', filePath: 'b.ts', lineStart: 1, lineEnd: 10 },
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:c.ts:main', targetId: 'cls:a.ts:Foo', type: 'imports' },
        ]);

        const dead = await detector.detect();
        expect(dead.length).toBe(1);
        expect(dead[0].node.name).toBe('Bar');
    });

    it('returns empty array when graph has no nodes', async () => {
        const dead = await detector.detect();
        expect(dead).toEqual([]);
    });

    it('includes reason for each dead code entry', async () => {
        await repo.insertNodes([
            { id: 'fn:orphan.ts:unused', type: 'function', name: 'unused', filePath: 'orphan.ts', lineStart: 1, lineEnd: 3 },
        ]);

        const dead = await detector.detect();
        expect(dead.length).toBe(1);
        expect(dead[0].reason).toBe('No dependents found');
    });
});
