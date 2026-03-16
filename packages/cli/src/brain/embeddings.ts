import type { SymbioteDB } from '../storage/db.js';

export interface SearchResult {
    nodeId: string;
    distance: number;
}

export async function storeEmbedding(
    db: SymbioteDB,
    nodeId: string,
    vector: number[],
): Promise<void> {
    const arrayLiteral = `[${vector.join(',')}]`;
    await db.run(
        `INSERT OR REPLACE INTO embeddings (node_id, vector) VALUES ($1, $2::FLOAT[384])`,
        nodeId,
        arrayLiteral,
    );
}

export async function deleteEmbeddingsForFile(db: SymbioteDB, filePath: string): Promise<void> {
    await db.run(
        `DELETE FROM embeddings WHERE node_id IN (
            SELECT id FROM nodes WHERE file_path = $1
        )`,
        filePath,
    );
}

export async function semanticSearch(
    db: SymbioteDB,
    queryVector: number[],
    limit: number = 10,
): Promise<SearchResult[]> {
    const arrayLiteral = `[${queryVector.join(',')}]`;
    const rows = (await db.all(
        `SELECT
            node_id,
            array_cosine_similarity(vector, $1::FLOAT[384]) AS similarity
         FROM embeddings
         WHERE vector IS NOT NULL
         ORDER BY similarity DESC
         LIMIT $2`,
        arrayLiteral,
        limit,
    )) as Array<{ node_id: string; similarity: number }>;

    return rows.map((r) => ({
        nodeId: r.node_id,
        distance: 1 - r.similarity,
    }));
}
