import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../src/storage/db.js';

describe('createDatabase', () => {
    let db: SymbioteDB;

    afterEach(async () => {
        await db?.close();
    });

    it('creates an in-memory database with schema', async () => {
        db = await createDatabase(':memory:');

        const result = await db.all(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
        ) as unknown as Array<{ table_name: string }>;
        const tableNames = result.map((r) => r.table_name);

        expect(tableNames).toContain('nodes');
        expect(tableNames).toContain('edges');
        expect(tableNames).toContain('files');
        expect(tableNames).toContain('meta');
    });

    it('stores and retrieves schema version', async () => {
        db = await createDatabase(':memory:');

        const rows = await db.all(
            "SELECT value FROM meta WHERE key = 'schema_version'"
        );

        expect(rows[0].value).toBe('1');
    });

    it('creates indexes on nodes and edges', async () => {
        db = await createDatabase(':memory:');

        const result = await db.all(
            "SELECT index_name FROM duckdb_indexes() WHERE table_name IN ('nodes', 'edges')"
        ) as unknown as Array<{ index_name: string }>;
        const indexNames = result.map((r) => r.index_name);

        expect(indexNames).toContain('idx_nodes_file');
        expect(indexNames).toContain('idx_nodes_type');
        expect(indexNames).toContain('idx_edges_source');
        expect(indexNames).toContain('idx_edges_target');
    });

    it('creates embeddings table with FLOAT[384] column', async () => {
        db = await createDatabase(':memory:');

        const result = await db.all(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'embeddings'"
        ) as unknown as Array<{ column_name: string; data_type: string }>;
        const columns = new Map(
            result.map((r) => [r.column_name, r.data_type] as const)
        );

        expect(columns.has('node_id')).toBe(true);
        expect(columns.has('vector')).toBe(true);
        expect(columns.get('vector')).toContain('FLOAT');
    });
});
