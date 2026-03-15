import { createRequire } from 'node:module';
import type { SynapseDB } from '../storage/db.js';

const require = createRequire(import.meta.url);

export interface SearchResult {
    nodeId: string;
    distance: number;
}

export function ensureEmbeddingsTable(db: SynapseDB): void {
    try {
        const sqliteVec = require('sqlite-vec');
        sqliteVec.load(db);
    } catch {
        // sqlite-vec may already be loaded
    }

    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(
            node_id TEXT PRIMARY KEY,
            vector float[384]
        );
    `);
}

export function storeEmbedding(
    db: SynapseDB,
    nodeId: string,
    vector: number[]
): void {
    const blob = float32ArrayToBlob(vector);
    db.prepare(
        'INSERT OR REPLACE INTO embeddings (node_id, vector) VALUES (?, ?)'
    ).run(nodeId, blob);
}

export function deleteEmbeddingsForFile(
    db: SynapseDB,
    filePath: string
): void {
    db.prepare(
        `DELETE FROM embeddings WHERE node_id IN (
            SELECT id FROM nodes WHERE file_path = ?
        )`
    ).run(filePath);
}

export function semanticSearch(
    db: SynapseDB,
    queryVector: number[],
    limit: number = 10
): SearchResult[] {
    const blob = float32ArrayToBlob(queryVector);
    const rows = db
        .prepare(
            `SELECT node_id, distance
             FROM embeddings
             WHERE vector MATCH ?
             ORDER BY distance
             LIMIT ?`
        )
        .all(blob, limit) as Array<{
        node_id: string;
        distance: number;
    }>;

    return rows.map((r) => ({
        nodeId: r.node_id,
        distance: r.distance,
    }));
}

function float32ArrayToBlob(vector: number[]): Buffer {
    const floats = new Float32Array(vector);
    return Buffer.from(floats.buffer);
}
