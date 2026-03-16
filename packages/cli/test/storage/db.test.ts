import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../src/storage/db.js';

describe('createDatabase', () => {
    let db: SymbioteDB;

    afterEach(() => {
        db?.close();
    });

    it('creates an in-memory database with schema', () => {
        db = createDatabase(':memory:');

        const tables = db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
            .all() as { name: string }[];

        const tableNames = tables.map((t) => t.name);
        expect(tableNames).toContain('nodes');
        expect(tableNames).toContain('edges');
        expect(tableNames).toContain('files');
        expect(tableNames).toContain('meta');
    });

    it('stores and retrieves schema version', () => {
        db = createDatabase(':memory:');

        const row = db
            .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
            .get() as { value: string };

        expect(row.value).toBe('1');
    });

    it('does not throw when creating an in-memory database', () => {
        expect(() => {
            db = createDatabase(':memory:');
        }).not.toThrow();
    });
});
