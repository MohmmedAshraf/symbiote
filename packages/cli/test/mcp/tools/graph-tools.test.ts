import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, SymbioteDB } from '../../../src/storage/db.js';
import { createCortexSchema, refreshSymbolsTable } from '../../../src/cortex/schema.js';
import { CortexRepository } from '../../../src/cortex/repository.js';
import { installPgq, createPropertyGraph, isPgqAvailable } from '../../../src/cortex/pgq.js';
import {
    handleQueryGraphV2,
    handleGetContextForSymbol,
    isLegacyQueryFormat,
} from '../../../src/mcp/tools/graph-tools.js';
import type { SymbolContext } from '../../../src/mcp/tools/graph-tools.js';

describe('query_graph (SQL/PGQ)', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;
    let pgqAvailable: boolean;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);

        await repo.upsertFileNode({
            id: 'file:a.ts',
            path: 'a.ts',
            hash: 'abc',
            language: 'typescript',
            depthLevel: 3,
            lastIndexed: null,
        });
        await repo.insertFunctionNodes([
            {
                id: 'fn:a.ts:foo',
                name: 'foo',
                qualifiedName: 'foo',
                filePath: 'a.ts',
                lineStart: 1,
                lineEnd: 5,
                isAsync: false,
                isExported: true,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: '(): void',
                community: null,
                pageRank: null,
                betweenness: null,
            },
            {
                id: 'fn:b.ts:bar',
                name: 'bar',
                qualifiedName: 'bar',
                filePath: 'b.ts',
                lineStart: 1,
                lineEnd: 5,
                isAsync: false,
                isExported: true,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: '(): string',
                community: null,
                pageRank: null,
                betweenness: null,
            },
        ]);
        await repo.insertCallsEdges([
            {
                sourceId: 'fn:a.ts:foo',
                targetId: 'fn:b.ts:bar',
                line: 3,
                confidence: 0.95,
                isDynamic: false,
                isAsync: false,
                isIndirect: false,
                stage: 3,
                reason: 'direct call',
            },
        ]);

        await refreshSymbolsTable(db);

        try {
            await installPgq(db);
            await createPropertyGraph(db);
            pgqAvailable = true;
        } catch {
            pgqAvailable = false;
        }
    });

    afterEach(async () => {
        await db.close();
    });

    describe('isLegacyQueryFormat', () => {
        it('detects legacy format with type field', () => {
            expect(isLegacyQueryFormat({ type: 'search', query: 'foo' })).toBe(true);
        });

        it('detects new format without type field', () => {
            expect(isLegacyQueryFormat({ query: 'SELECT * FROM symbols' })).toBe(false);
        });
    });

    it('executes SQL query against symbols table', async () => {
        const result = await handleQueryGraphV2(
            { db, cortexRepo: repo },
            { query: 'SELECT id, name, kind FROM symbols ORDER BY name' },
        );
        expect(result.data).toHaveLength(2);
        expect(result.depth).toBeGreaterThanOrEqual(0);
        expect(typeof result.deepening).toBe('boolean');
    });

    it('rejects mutating queries', async () => {
        await expect(
            handleQueryGraphV2({ db, cortexRepo: repo }, { query: 'DROP TABLE nodes_function' }),
        ).rejects.toThrow();
    });
});

describe('get_context_for_symbol', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);

        await repo.upsertFileNode({
            id: 'file:a.ts',
            path: 'a.ts',
            hash: 'abc',
            language: 'typescript',
            depthLevel: 3,
            lastIndexed: null,
        });
        await repo.insertFunctionNodes([
            {
                id: 'fn:a.ts:foo',
                name: 'foo',
                qualifiedName: 'foo',
                filePath: 'a.ts',
                lineStart: 1,
                lineEnd: 10,
                isAsync: false,
                isExported: true,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: '(): void',
                community: null,
                pageRank: null,
                betweenness: null,
            },
            {
                id: 'fn:b.ts:caller',
                name: 'caller',
                qualifiedName: 'caller',
                filePath: 'b.ts',
                lineStart: 1,
                lineEnd: 5,
                isAsync: false,
                isExported: true,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: null,
                community: null,
                pageRank: null,
                betweenness: null,
            },
        ]);
        await repo.insertCallsEdges([
            {
                sourceId: 'fn:b.ts:caller',
                targetId: 'fn:a.ts:foo',
                line: 3,
                confidence: 0.9,
                isDynamic: false,
                isAsync: false,
                isIndirect: false,
                stage: 3,
                reason: 'direct call',
            },
        ]);

        await refreshSymbolsTable(db);
    });

    afterEach(async () => {
        await db.close();
    });

    it('returns full context for symbol by name', async () => {
        const result = await handleGetContextForSymbol({ db, cortexRepo: repo }, { symbol: 'foo' });
        expect('error' in result.data).toBe(false);
        const data = result.data as SymbolContext;
        expect(data.symbol.name).toBe('foo');
        expect(data.callers).toHaveLength(1);
        expect(data.callers[0].sourceId).toBe('fn:b.ts:caller');
        expect(result.depth).toBe(3);
    });

    it('returns full context for symbol by ID', async () => {
        const result = await handleGetContextForSymbol(
            { db, cortexRepo: repo },
            { symbol: 'fn:a.ts:foo' },
        );
        expect('error' in result.data).toBe(false);
        const data = result.data as SymbolContext;
        expect(data.symbol.id).toBe('fn:a.ts:foo');
    });

    it('returns error for unknown symbol', async () => {
        const result = await handleGetContextForSymbol(
            { db, cortexRepo: repo },
            { symbol: 'nonexistent' },
        );
        expect(result.data).toHaveProperty('error');
    });

    it('includes callees in context', async () => {
        await repo.insertCallsEdges([
            {
                sourceId: 'fn:a.ts:foo',
                targetId: 'fn:b.ts:caller',
                line: 5,
                confidence: 0.8,
                isDynamic: false,
                isAsync: false,
                isIndirect: false,
                stage: 3,
                reason: 'direct call',
            },
        ]);
        const result = await handleGetContextForSymbol({ db, cortexRepo: repo }, { symbol: 'foo' });
        const data = result.data as SymbolContext;
        expect(data.callees).toHaveLength(1);
        expect(data.callees[0].targetId).toBe('fn:b.ts:caller');
    });
});
