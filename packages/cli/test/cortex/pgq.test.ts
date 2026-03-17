import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema, refreshSymbolsTable } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { installPgq, createPropertyGraph, isPgqAvailable } from '../../src/cortex/pgq.js';

describe('DuckPGQ Setup', () => {
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

    it('installs and loads duckpgq extension', async () => {
        await installPgq(db);
        const available = await isPgqAvailable(db);
        expect(available).toBe(true);
    });

    it('creates property graph over cortex tables', async () => {
        await installPgq(db);
        await createPropertyGraph(db);
        const rows = await db.all<{ property_graph: string }>(`DESCRIBE PROPERTY GRAPH code_graph`);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].property_graph).toBe('code_graph');
    });

    it('property graph is recreatable (idempotent)', async () => {
        await installPgq(db);
        await createPropertyGraph(db);
        await createPropertyGraph(db);
        const rows = await db.all<{ property_graph: string }>(`DESCRIBE PROPERTY GRAPH code_graph`);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].property_graph).toBe('code_graph');
    });

    it('executes basic GRAPH_TABLE query with data', async () => {
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
                signature: '(): void',
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

        await installPgq(db);
        await createPropertyGraph(db);

        const rows = await db.all<{ callee_name: string }>(
            `SELECT callee_name FROM GRAPH_TABLE (code_graph
                MATCH (a:symbols)-[e:edges_calls]->(b:symbols)
                WHERE a.name = 'foo'
                COLUMNS (b.name AS callee_name)
            )`,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].callee_name).toBe('bar');
    });
});

describe('Symbols materialization', () => {
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

    it('refreshSymbolsTable materializes symbol data', async () => {
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
                signature: null,
                community: null,
                pageRank: null,
                betweenness: null,
            },
        ]);
        await repo.insertClassNodes([
            {
                id: 'class:a.ts:Bar',
                name: 'Bar',
                filePath: 'a.ts',
                lineStart: 10,
                lineEnd: 20,
                isAbstract: false,
                isExported: true,
                community: null,
                pageRank: null,
                betweenness: null,
            },
        ]);

        await refreshSymbolsTable(db);

        const rows = await db.all<{ id: string; kind: string }>(
            'SELECT id, kind FROM symbols ORDER BY id',
        );
        expect(rows).toHaveLength(2);
        expect(rows[0].id).toBe('class:a.ts:Bar');
        expect(rows[0].kind).toBe('class');
        expect(rows[1].id).toBe('fn:a.ts:foo');
        expect(rows[1].kind).toBe('function');
    });

    it('refreshSymbolsTable is idempotent', async () => {
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
                signature: null,
                community: null,
                pageRank: null,
                betweenness: null,
            },
        ]);

        await refreshSymbolsTable(db);
        await refreshSymbolsTable(db);

        const rows = await db.all<{ id: string }>('SELECT id FROM symbols');
        expect(rows).toHaveLength(1);
    });
});
