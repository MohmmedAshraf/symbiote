import { DuckDBInstance } from '@duckdb/node-api';

const SCHEMA_VERSION = 1;

export class SymbioteDB {
    private constructor(
        private instance: DuckDBInstance,
        private conn: Awaited<ReturnType<DuckDBInstance['connect']>>,
    ) {}

    static async create(path: string): Promise<SymbioteDB> {
        const instance = await DuckDBInstance.create(path);
        const conn = await instance.connect();
        return new SymbioteDB(instance, conn);
    }

    async exec(sql: string): Promise<void> {
        await this.conn.run(sql);
    }

    async run(sql: string, ...params: unknown[]): Promise<void> {
        if (params.length === 0) {
            await this.conn.run(sql);
            return;
        }
        const prepared = await this.conn.prepare(sql);
        for (let i = 0; i < params.length; i++) {
            this.bindParam(prepared, i + 1, params[i]);
        }
        await prepared.run();
    }

    async all(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> {
        if (params.length === 0) {
            const reader = await this.conn.runAndReadAll(sql);
            return reader.getRowObjects() as Record<string, unknown>[];
        }
        const prepared = await this.conn.prepare(sql);
        for (let i = 0; i < params.length; i++) {
            this.bindParam(prepared, i + 1, params[i]);
        }
        const result = await prepared.run();
        return (await result.getRowObjects()) as Record<string, unknown>[];
    }

    async close(): Promise<void> {
        this.conn.closeSync();
        this.instance.closeSync();
    }

    private bindParam(
        prepared: Awaited<ReturnType<typeof this.conn.prepare>>,
        index: number,
        value: unknown,
    ): void {
        if (value === null || value === undefined) {
            prepared.bindNull(index);
        } else if (typeof value === 'string') {
            prepared.bindVarchar(index, value);
        } else if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                prepared.bindInteger(index, value);
            } else {
                prepared.bindDouble(index, value);
            }
        } else if (typeof value === 'bigint') {
            prepared.bindBigInt(index, value);
        } else if (typeof value === 'boolean') {
            prepared.bindBoolean(index, value);
        } else {
            prepared.bindVarchar(index, String(value));
        }
    }
}

export async function createDatabase(path: string): Promise<SymbioteDB> {
    const db = await SymbioteDB.create(path);

    await db.exec(`
        CREATE SEQUENCE IF NOT EXISTS health_snapshot_seq START 1;

        CREATE TABLE IF NOT EXISTS nodes (
            id VARCHAR PRIMARY KEY,
            type VARCHAR NOT NULL,
            name VARCHAR NOT NULL,
            file_path VARCHAR NOT NULL,
            line_start INTEGER NOT NULL,
            line_end INTEGER NOT NULL,
            metadata VARCHAR DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS edges (
            source_id VARCHAR NOT NULL,
            target_id VARCHAR NOT NULL,
            type VARCHAR NOT NULL,
            PRIMARY KEY (source_id, target_id, type)
        );

        CREATE TABLE IF NOT EXISTS files (
            path VARCHAR PRIMARY KEY,
            hash VARCHAR NOT NULL,
            last_scanned VARCHAR NOT NULL
        );

        CREATE TABLE IF NOT EXISTS meta (
            key VARCHAR PRIMARY KEY,
            value VARCHAR NOT NULL
        );

        CREATE TABLE IF NOT EXISTS embeddings (
            node_id VARCHAR PRIMARY KEY,
            vector FLOAT[384]
        );

        CREATE TABLE IF NOT EXISTS health_snapshots (
            id INTEGER PRIMARY KEY DEFAULT nextval('health_snapshot_seq'),
            score INTEGER NOT NULL,
            constraint_score INTEGER NOT NULL,
            circular_dep_score INTEGER NOT NULL,
            dead_code_score INTEGER NOT NULL,
            coupling_score INTEGER NOT NULL,
            constraint_violation_count INTEGER NOT NULL,
            circular_dep_count INTEGER NOT NULL,
            dead_code_count INTEGER NOT NULL,
            coupling_hotspot_count INTEGER NOT NULL,
            created_at VARCHAR NOT NULL DEFAULT current_timestamp
        );

        CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
        CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
        CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
        CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
        CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
        CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
    `);

    await db.exec('INSTALL fts; LOAD fts;');

    const existing = await db.all("SELECT value FROM meta WHERE key = 'schema_version'");

    if (existing.length === 0) {
        await db.run(
            'INSERT INTO meta (key, value) VALUES ($1, $2)',
            'schema_version',
            String(SCHEMA_VERSION),
        );
    }

    return db;
}
