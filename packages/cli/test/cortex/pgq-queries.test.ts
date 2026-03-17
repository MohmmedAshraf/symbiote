import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, SymbioteDB } from '#storage/db.js';
import { createCortexSchema, refreshSymbolsTable } from '#cortex/schema.js';
import { CortexRepository } from '#cortex/repository.js';
import { installPgq, createPropertyGraph } from '#cortex/pgq.js';
import { executePgqQuery, validatePgqQuery } from '#cortex/pgq-queries.js';

describe('PGQ Query Builder', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
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
                isExported: false,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: '(): string',
                community: null,
                pageRank: null,
                betweenness: null,
            },
            {
                id: 'fn:c.ts:baz',
                name: 'baz',
                qualifiedName: 'baz',
                filePath: 'c.ts',
                lineStart: 1,
                lineEnd: 5,
                isAsync: true,
                isExported: true,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: '(): Promise<void>',
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
            {
                sourceId: 'fn:b.ts:bar',
                targetId: 'fn:c.ts:baz',
                line: 2,
                confidence: 0.9,
                isDynamic: false,
                isAsync: true,
                isIndirect: false,
                stage: 3,
                reason: 'direct call',
            },
        ]);

        await refreshSymbolsTable(db);
        await installPgq(db);
        await createPropertyGraph(db);
    });

    afterEach(async () => {
        await db.close();
    });

    describe('validatePgqQuery', () => {
        it('accepts valid SELECT ... FROM GRAPH_TABLE query', () => {
            const result = validatePgqQuery(
                `SELECT * FROM GRAPH_TABLE (code_graph MATCH (a:symbols)-[e:edges_calls]->(b:symbols) COLUMNS (b.name))`,
            );
            expect(result.valid).toBe(true);
        });

        it('rejects queries with INSERT/UPDATE/DELETE/DROP/ALTER/CREATE', () => {
            expect(validatePgqQuery('DROP TABLE nodes_function').valid).toBe(false);
            expect(validatePgqQuery('DELETE FROM nodes_function').valid).toBe(false);
            expect(validatePgqQuery('INSERT INTO nodes_function VALUES (1)').valid).toBe(false);
            expect(validatePgqQuery('UPDATE nodes_function SET name = "x"').valid).toBe(false);
            expect(validatePgqQuery('ALTER TABLE nodes_function ADD COLUMN x INT').valid).toBe(
                false,
            );
            expect(validatePgqQuery('CREATE TABLE evil (id INT)').valid).toBe(false);
        });

        it('rejects queries with semicolons (multi-statement)', () => {
            const result = validatePgqQuery('SELECT 1; DROP TABLE nodes_function');
            expect(result.valid).toBe(false);
        });

        it('accepts plain SQL SELECT queries', () => {
            const result = validatePgqQuery("SELECT id, name FROM symbols WHERE kind = 'function'");
            expect(result.valid).toBe(true);
        });
    });

    describe('executePgqQuery', () => {
        it('executes GRAPH_TABLE query and returns rows', async () => {
            const rows = await executePgqQuery(
                db,
                `SELECT callee FROM GRAPH_TABLE (code_graph
                    MATCH (a:symbols)-[e:edges_calls]->(b:symbols)
                    WHERE a.name = 'foo'
                    COLUMNS (b.name AS callee)
                )`,
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].callee).toBe('bar');
        });

        it('executes multi-hop path query', async () => {
            const rows = await executePgqQuery(
                db,
                `SELECT src, dst FROM GRAPH_TABLE (code_graph
                    MATCH (a:symbols)-[e:edges_calls]->{1,5}(b:symbols)
                    WHERE a.name = 'foo'
                    COLUMNS (a.name AS src, b.name AS dst)
                )`,
            );
            expect(rows.length).toBeGreaterThanOrEqual(1);
            const names = rows.map((r: Record<string, unknown>) => r.dst);
            expect(names).toContain('bar');
        });

        it('executes plain SQL query against cortex tables', async () => {
            const rows = await executePgqQuery(
                db,
                `SELECT id, name, kind FROM symbols WHERE kind = 'function' ORDER BY name`,
            );
            expect(rows).toHaveLength(3);
            expect(rows[0].name).toBe('bar');
        });

        it('throws on mutating query', async () => {
            await expect(executePgqQuery(db, 'DROP TABLE nodes_function')).rejects.toThrow();
        });

        it('enforces row limit', async () => {
            const rows = await executePgqQuery(db, 'SELECT id, name FROM symbols', { maxRows: 1 });
            expect(rows).toHaveLength(1);
        });
    });
});
