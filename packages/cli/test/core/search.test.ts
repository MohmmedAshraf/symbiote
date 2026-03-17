import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { Repository } from '#storage/repository.js';
import { HybridSearch } from '#core/search.js';

const TEST_NODES = [
    {
        id: 'fn:a:validateEmail',
        type: 'function',
        name: 'validateEmail',
        filePath: 'src/validators.ts',
        lineStart: 1,
        lineEnd: 5,
    },
    {
        id: 'fn:b:renderDashboard',
        type: 'function',
        name: 'renderDashboard',
        filePath: 'src/ui/dashboard.tsx',
        lineStart: 10,
        lineEnd: 50,
    },
    {
        id: 'fn:c:checkEmailFormat',
        type: 'function',
        name: 'checkEmailFormat',
        filePath: 'src/validators.ts',
        lineStart: 7,
        lineEnd: 12,
    },
    {
        id: 'class:d:AuthService',
        type: 'class',
        name: 'AuthService',
        filePath: 'src/auth/service.ts',
        lineStart: 1,
        lineEnd: 40,
    },
    {
        id: 'fn:e:handleLogin',
        type: 'function',
        name: 'handleLogin',
        filePath: 'src/auth/handlers.ts',
        lineStart: 1,
        lineEnd: 20,
    },
];

describe('HybridSearch', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let search: HybridSearch;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
        await repo.insertNodes(TEST_NODES);
        search = new HybridSearch(db, repo);
    });

    afterEach(async () => {
        await db.close();
    });

    describe('BM25 text search', () => {
        it('finds nodes matching a keyword', async () => {
            const results = await search.textSearch('email');
            expect(results.length).toBeGreaterThanOrEqual(2);
            const names = results.map((r) => r.node.name);
            expect(names).toContain('validateEmail');
            expect(names).toContain('checkEmailFormat');
        });

        it('searches file paths too', async () => {
            const results = await search.textSearch('dashboard');
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].node.name).toBe('renderDashboard');
        });
    });

    describe('hybrid search (text only, no embeddings)', () => {
        it('falls back to BM25-only when no embeddings exist', async () => {
            const results = await search.search('email validation');
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results.some((r) => r.node.name.toLowerCase().includes('email'))).toBe(true);
        });

        it('respects the limit parameter', async () => {
            const results = await search.search('email', { limit: 1 });
            expect(results).toHaveLength(1);
        });
    });

    describe('RRF fusion', () => {
        it('merges two ranked lists with correct scores', () => {
            const textResults = [
                { nodeId: 'a', score: 10 },
                { nodeId: 'b', score: 8 },
                { nodeId: 'c', score: 5 },
            ];
            const vectorResults = [
                { nodeId: 'c', score: 0.95 },
                { nodeId: 'a', score: 0.8 },
                { nodeId: 'd', score: 0.7 },
            ];
            const fused = HybridSearch.rrfFuse(textResults, vectorResults, 60);
            expect(fused).toHaveLength(4);
            expect(fused[0].nodeId).toBe('a');
        });
    });
});
