import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../src/storage/db.js';
import { Repository } from '../../src/storage/repository.js';
import {
    storeEmbedding,
    semanticSearch,
} from '../../src/brain/embeddings.js';

describe('brain embeddings', () => {
    let db: SymbioteDB;
    let repo: Repository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
    });

    afterEach(async () => {
        await db.close();
    });

    it('creates the embeddings table with schema', async () => {
        const tables = await db.all(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_name = 'embeddings'"
        ) as { table_name: string }[];
        expect(tables.length).toBe(1);
    });

    it('stores and retrieves an embedding for a node', async () => {
        await repo.insertNodes([
            {
                id: 'fn:test.ts:hello',
                type: 'function',
                name: 'hello',
                filePath: 'test.ts',
                lineStart: 1,
                lineEnd: 3,
            },
        ]);

        const fakeVector = new Array(384)
            .fill(0)
            .map((_, i) => i / 384);
        await storeEmbedding(db, 'fn:test.ts:hello', fakeVector);

        const count = await db.all(
            'SELECT COUNT(*) as count FROM embeddings'
        ) as Array<{ count: number | bigint }>;
        expect(Number(count[0].count)).toBe(1);
    });

    it('performs semantic search and returns ranked results', async () => {
        await repo.insertNodes([
            {
                id: 'fn:auth.ts:login',
                type: 'function',
                name: 'login',
                filePath: 'auth.ts',
                lineStart: 1,
                lineEnd: 5,
            },
            {
                id: 'fn:math.ts:add',
                type: 'function',
                name: 'add',
                filePath: 'math.ts',
                lineStart: 1,
                lineEnd: 3,
            },
        ]);

        const authVector = new Array(384)
            .fill(0)
            .map((_, i) => (i % 2 === 0 ? 1 : 0));
        const mathVector = new Array(384)
            .fill(0)
            .map((_, i) => (i % 2 === 0 ? 0 : 1));
        await storeEmbedding(db, 'fn:auth.ts:login', authVector);
        await storeEmbedding(db, 'fn:math.ts:add', mathVector);

        const queryVector = authVector;
        const results = await semanticSearch(db, queryVector, 5);

        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].nodeId).toBe('fn:auth.ts:login');
    });
});
