import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, SymbioteDB } from '#storage/db.js';
import { createCortexSchema, CORTEX_TABLES } from '#cortex/schema.js';

describe('Cortex Schema', () => {
    let db: SymbioteDB;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
    });

    afterEach(async () => {
        await db.close();
    });

    it('creates all node tables', async () => {
        await createCortexSchema(db);
        for (const table of CORTEX_TABLES.nodes) {
            const rows = await db.all<{ name: string }>(
                `SELECT table_name as name FROM information_schema.tables WHERE table_name = '${table}'`,
            );
            expect(rows.length, `table ${table} should exist`).toBe(1);
        }
    });

    it('creates all edge tables', async () => {
        await createCortexSchema(db);
        for (const table of CORTEX_TABLES.edges) {
            const rows = await db.all<{ name: string }>(
                `SELECT table_name as name FROM information_schema.tables WHERE table_name = '${table}'`,
            );
            expect(rows.length, `table ${table} should exist`).toBe(1);
        }
    });

    it('creates auxiliary tables', async () => {
        await createCortexSchema(db);
        for (const table of CORTEX_TABLES.auxiliary) {
            const rows = await db.all<{ name: string }>(
                `SELECT table_name as name FROM information_schema.tables WHERE table_name = '${table}'`,
            );
            expect(rows.length, `table ${table} should exist`).toBe(1);
        }
    });

    it('creates symbols view', async () => {
        await createCortexSchema(db);
        const rows = await db.all<{ name: string }>(
            `SELECT table_name as name FROM information_schema.tables WHERE table_name = 'symbols'`,
        );
        expect(rows.length).toBe(1);
    });

    it('creates type_constraints table', async () => {
        await createCortexSchema(db);
        const rows = await db.all<{ name: string }>(
            `SELECT table_name as name FROM information_schema.tables WHERE table_name = 'type_constraints'`,
        );
        expect(rows.length, 'type_constraints table should exist').toBe(1);
    });

    it('creates generic_instantiations table', async () => {
        await createCortexSchema(db);
        const rows = await db.all<{ name: string }>(
            `SELECT table_name as name FROM information_schema.tables WHERE table_name = 'generic_instantiations'`,
        );
        expect(rows.length, 'generic_instantiations table should exist').toBe(1);
    });

    it('is idempotent', async () => {
        await createCortexSchema(db);
        await createCortexSchema(db);
        const rows = await db.all<{ count: number }>(
            `SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'main'`,
        );
        expect(rows[0].count).toBeGreaterThan(0);
    });
});
