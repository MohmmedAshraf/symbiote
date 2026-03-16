import { createRequire } from 'node:module';
import type { Database as DatabaseType } from 'better-sqlite3';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

export type SymbioteDB = DatabaseType;

const SCHEMA_VERSION = 1;

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS edges (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        PRIMARY KEY (source_id, target_id, type)
    );

    CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        last_scanned TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
    CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
    CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
    CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
    CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
`;

export function createDatabase(path: string): SymbioteDB {
    const db = new Database(path) as SymbioteDB;

    if (path !== ':memory:') {
        db.pragma('journal_mode = WAL');
    }

    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);

    const existing = db
        .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
        .get() as { value: string } | undefined;

    if (!existing) {
        db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
            'schema_version',
            String(SCHEMA_VERSION)
        );
    }

    return db;
}
