import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { Repository } from '#storage/repository.js';
import { DeadCodeDetector } from '#brain/health/dead-code-detector.js';

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
            {
                id: 'fn:a.ts:main',
                type: 'function',
                name: 'main',
                filePath: 'a.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:b.ts:helper',
                type: 'function',
                name: 'helper',
                filePath: 'b.ts',
                lineStart: 1,
                lineEnd: 3,
            },
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
            {
                id: 'fn:a.ts:main',
                type: 'function',
                name: 'main',
                filePath: 'a.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:b.ts:helper',
                type: 'function',
                name: 'helper',
                filePath: 'b.ts',
                lineStart: 1,
                lineEnd: 3,
            },
            {
                id: 'fn:c.ts:orphan',
                type: 'function',
                name: 'orphan',
                filePath: 'c.ts',
                lineStart: 1,
                lineEnd: 3,
            },
        ]);
        await repo.insertEdges([
            { sourceId: 'fn:a.ts:main', targetId: 'fn:b.ts:helper', type: 'calls' },
        ]);

        const dead = await detector.detect();
        expect(dead.length).toBe(1);
        const deadNames = dead.map((d) => d.node.name);
        expect(deadNames).not.toContain('main');
        expect(deadNames).toContain('orphan');
    });

    it('exempts entry-point-named symbols but catches others in the same file', async () => {
        await repo.insertNodes([
            {
                id: 'fn:index.ts:main',
                type: 'function',
                name: 'main',
                filePath: 'index.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:main.ts:run',
                type: 'function',
                name: 'run',
                filePath: 'main.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:app.ts:start',
                type: 'function',
                name: 'start',
                filePath: 'app.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:index.ts:unusedInEntry',
                type: 'function',
                name: 'unusedInEntry',
                filePath: 'index.ts',
                lineStart: 6,
                lineEnd: 10,
            },
        ]);

        const dead = await detector.detect();
        const deadNames = dead.map((d) => d.node.name);
        expect(deadNames).not.toContain('main');
        expect(deadNames).not.toContain('run');
        expect(deadNames).not.toContain('start');
        expect(deadNames).toContain('unusedInEntry');
    });

    it('detects unreferenced classes', async () => {
        await repo.insertNodes([
            {
                id: 'cls:a.ts:Foo',
                type: 'class',
                name: 'Foo',
                filePath: 'a.ts',
                lineStart: 1,
                lineEnd: 10,
            },
            {
                id: 'cls:b.ts:Bar',
                type: 'class',
                name: 'Bar',
                filePath: 'b.ts',
                lineStart: 1,
                lineEnd: 10,
            },
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
            {
                id: 'fn:orphan.ts:unused',
                type: 'function',
                name: 'unused',
                filePath: 'orphan.ts',
                lineStart: 1,
                lineEnd: 3,
            },
        ]);

        const dead = await detector.detect();
        expect(dead.length).toBe(1);
        expect(dead[0].reason).toBe('No dependents found');
    });

    it('detects unreferenced types, interfaces, and variables', async () => {
        await repo.insertNodes([
            {
                id: 'type:utils.ts:Config',
                type: 'type',
                name: 'Config',
                filePath: 'src/utils.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'iface:utils.ts:Logger',
                type: 'interface',
                name: 'Logger',
                filePath: 'src/utils.ts',
                lineStart: 6,
                lineEnd: 10,
            },
            {
                id: 'var:utils.ts:TIMEOUT',
                type: 'variable',
                name: 'DEFAULT_TIMEOUT',
                filePath: 'src/utils.ts',
                lineStart: 11,
                lineEnd: 11,
            },
        ]);
        const dead = await detector.detect();
        const deadNames = dead.map((d) => d.node.name);
        expect(deadNames).toContain('Config');
        expect(deadNames).toContain('Logger');
        expect(deadNames).toContain('DEFAULT_TIMEOUT');
    });

    it('detects transitively dead code', async () => {
        await repo.insertNodes([
            {
                id: 'fn:lib.ts:deadHelper',
                type: 'function',
                name: 'deadHelper',
                filePath: 'src/lib.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:lib.ts:alsoDeadCaller',
                type: 'function',
                name: 'alsoDeadCaller',
                filePath: 'src/lib.ts',
                lineStart: 6,
                lineEnd: 10,
            },
        ]);
        await repo.insertEdges([
            {
                sourceId: 'fn:lib.ts:alsoDeadCaller',
                targetId: 'fn:lib.ts:deadHelper',
                type: 'calls',
            },
        ]);
        const dead = await detector.detect();
        const deadNames = dead.map((d) => d.node.name);
        expect(deadNames).toContain('deadHelper');
        expect(deadNames).toContain('alsoDeadCaller');
    });

    it('only exempts entry-point-named symbols, not all exports in entry files', async () => {
        await repo.insertNodes([
            {
                id: 'fn:index.ts:main',
                type: 'function',
                name: 'main',
                filePath: 'index.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:index.ts:unusedHelper',
                type: 'function',
                name: 'unusedHelper',
                filePath: 'index.ts',
                lineStart: 6,
                lineEnd: 10,
            },
        ]);
        const dead = await detector.detect();
        const deadNames = dead.map((d) => d.node.name);
        expect(deadNames).not.toContain('main');
        expect(deadNames).toContain('unusedHelper');
    });
});
