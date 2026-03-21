import { DuckDBInstance } from '@duckdb/node-api';
import { createCortexSchema } from '#cortex/schema.js';

const SCHEMA_VERSION = 2;

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
        try {
            for (let i = 0; i < params.length; i++) {
                this.bindParam(prepared, i + 1, params[i]);
            }
            await prepared.run();
        } finally {
            prepared.destroySync();
        }
    }

    async all<T extends Record<string, unknown> = Record<string, unknown>>(
        sql: string,
        ...params: unknown[]
    ): Promise<T[]> {
        if (params.length === 0) {
            const reader = await this.conn.runAndReadAll(sql);
            return reader.getRowObjects() as T[];
        }
        const prepared = await this.conn.prepare(sql);
        try {
            for (let i = 0; i < params.length; i++) {
                this.bindParam(prepared, i + 1, params[i]);
            }
            const result = await prepared.run();
            return (await result.getRowObjects()) as T[];
        } finally {
            prepared.destroySync();
        }
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
            prepared.bindVarchar(index, JSON.stringify(value));
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

    await db.exec(`
        CREATE SEQUENCE IF NOT EXISTS session_obs_seq START 1;

        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            started_at BIGINT NOT NULL,
            ended_at BIGINT,
            reason TEXT,
            files_touched TEXT,
            symbols_modified TEXT,
            tool_counts TEXT,
            failure_count INTEGER DEFAULT 0,
            interaction_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS session_observations (
            id INTEGER DEFAULT nextval('session_obs_seq'),
            session_id TEXT NOT NULL,
            timestamp BIGINT NOT NULL,
            tool_name TEXT NOT NULL,
            event TEXT NOT NULL,
            file_path TEXT,
            symbols_affected TEXT,
            metadata TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_obs_session ON session_observations(session_id);
        CREATE INDEX IF NOT EXISTS idx_obs_tool ON session_observations(tool_name);
        CREATE INDEX IF NOT EXISTS idx_obs_file ON session_observations(file_path);

        CREATE TABLE IF NOT EXISTS session_snapshots (
            session_id TEXT PRIMARY KEY,
            snapshot TEXT NOT NULL
        );
    `);

    await createCortexSchema(db);

    await db.exec('INSTALL fts; LOAD fts;');

    const existing = await db.all<{ value: string } & Record<string, unknown>>(
        "SELECT value FROM meta WHERE key = 'schema_version'",
    );

    if (existing.length === 0) {
        await db.run(
            'INSERT INTO meta (key, value) VALUES ($1, $2)',
            'schema_version',
            String(SCHEMA_VERSION),
        );
    } else {
        const storedVersion = parseInt(existing[0].value, 10);
        if (storedVersion < SCHEMA_VERSION) {
            await migrateSchema(db, storedVersion, SCHEMA_VERSION);
            await db.run(
                "UPDATE meta SET value = $1 WHERE key = 'schema_version'",
                String(SCHEMA_VERSION),
            );
        }
    }

    return db;
}

async function migrateSchema(db: SymbioteDB, from: number, _to: number): Promise<void> {
    if (from < 2) {
        await db.exec(`
            CREATE SEQUENCE IF NOT EXISTS session_obs_seq START 1;

            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                started_at BIGINT NOT NULL,
                ended_at BIGINT,
                reason TEXT,
                files_touched TEXT,
                symbols_modified TEXT,
                tool_counts TEXT,
                failure_count INTEGER DEFAULT 0,
                interaction_count INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS session_observations (
                id INTEGER DEFAULT nextval('session_obs_seq'),
                session_id TEXT NOT NULL,
                timestamp BIGINT NOT NULL,
                tool_name TEXT NOT NULL,
                event TEXT NOT NULL,
                file_path TEXT,
                symbols_affected TEXT,
                metadata TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_obs_session ON session_observations(session_id);
            CREATE INDEX IF NOT EXISTS idx_obs_tool ON session_observations(tool_name);
            CREATE INDEX IF NOT EXISTS idx_obs_file ON session_observations(file_path);

            CREATE TABLE IF NOT EXISTS session_snapshots (
                session_id TEXT PRIMARY KEY,
                snapshot TEXT NOT NULL
            );
        `);
    }
}
