import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { wrapResponse, getMaxDepth, getDepthForFile } from '../../src/mcp/tool-response.js';

describe('ToolResponse', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
    });

    afterEach(async () => {
        await db.close();
    });

    it('wraps data with depth and deepening fields', () => {
        const result = wrapResponse({ foo: 'bar' }, 3, false);
        expect(result).toEqual({
            data: { foo: 'bar' },
            depth: 3,
            deepening: false,
        });
    });

    it('includes stale_since when provided', () => {
        const result = wrapResponse({ foo: 'bar' }, 3, false, '2026-03-17T00:00:00Z');
        expect(result).toEqual({
            data: { foo: 'bar' },
            depth: 3,
            deepening: false,
            stale_since: '2026-03-17T00:00:00Z',
        });
    });

    it('omits stale_since when undefined', () => {
        const result = wrapResponse({ foo: 'bar' }, 5, true);
        expect(result).not.toHaveProperty('stale_since');
    });

    it('getMaxDepth returns 0 for empty db', async () => {
        const depth = await getMaxDepth(repo);
        expect(depth).toBe(0);
    });

    it('getMaxDepth returns min depth across files', async () => {
        await repo.upsertFileNode({
            id: 'file:a.ts',
            path: 'a.ts',
            hash: 'abc',
            language: 'typescript',
            depthLevel: 5,
            lastIndexed: null,
        });
        await repo.upsertFileNode({
            id: 'file:b.ts',
            path: 'b.ts',
            hash: 'def',
            language: 'typescript',
            depthLevel: 3,
            lastIndexed: null,
        });
        const depth = await getMaxDepth(repo);
        expect(depth).toBe(3);
    });

    it('getMaxDepth returns max when all files at same depth', async () => {
        await repo.upsertFileNode({
            id: 'file:a.ts',
            path: 'a.ts',
            hash: 'abc',
            language: 'typescript',
            depthLevel: 7,
            lastIndexed: null,
        });
        await repo.upsertFileNode({
            id: 'file:b.ts',
            path: 'b.ts',
            hash: 'def',
            language: 'typescript',
            depthLevel: 7,
            lastIndexed: null,
        });
        const depth = await getMaxDepth(repo);
        expect(depth).toBe(7);
    });

    it('getDepthForFile returns 0 for nonexistent file', async () => {
        const depth = await getDepthForFile(repo, 'does/not/exist.ts');
        expect(depth).toBe(0);
    });
});
