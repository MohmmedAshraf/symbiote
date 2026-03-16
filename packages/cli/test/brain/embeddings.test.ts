import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../src/storage/db.js';
import { Repository } from '../../src/storage/repository.js';
import {
    ensureEmbeddingsTable,
    storeEmbedding,
    semanticSearch,
} from '../../src/brain/embeddings.js';

describe('brain embeddings', () => {
    let db: SymbioteDB;
    let repo: Repository;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new Repository(db);
        ensureEmbeddingsTable(db);
    });

    afterEach(() => {
        db.close();
    });

    it('creates the embeddings virtual table', () => {
        const tables = db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'"
            )
            .get();
        expect(tables).toBeDefined();
    });

    it('stores and retrieves an embedding for a node', () => {
        repo.insertNodes([
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
        storeEmbedding(db, 'fn:test.ts:hello', fakeVector);

        const count = db
            .prepare('SELECT COUNT(*) as count FROM embeddings')
            .get() as { count: number };
        expect(count.count).toBe(1);
    });

    it('performs semantic search and returns ranked results', () => {
        repo.insertNodes([
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
        storeEmbedding(db, 'fn:auth.ts:login', authVector);
        storeEmbedding(db, 'fn:math.ts:add', mathVector);

        const queryVector = authVector;
        const results = semanticSearch(db, queryVector, 5);

        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].nodeId).toBe('fn:auth.ts:login');
    });
});
