import type { SymbioteDB } from './db.js';

export interface NodeRecord {
    id: string;
    type: string;
    name: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    metadata?: Record<string, unknown>;
}

export interface EdgeRecord {
    sourceId: string;
    targetId: string;
    type: string;
}

export interface FileRecord {
    path: string;
    hash: string;
    lastScanned: string;
}

interface NodeRow extends Record<string, unknown> {
    id: string;
    type: string;
    name: string;
    file_path: string;
    line_start: number;
    line_end: number;
    metadata: string;
}

interface EdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
    type: string;
}

interface FileRow extends Record<string, unknown> {
    path: string;
    hash: string;
    last_scanned: string;
}

interface StatsRow extends Record<string, unknown> {
    nodes: number | bigint;
    edges: number | bigint;
    files: number | bigint;
}

interface TypeCountRow extends Record<string, unknown> {
    type: string;
    count: number | bigint;
}

interface HubRow extends NodeRow {
    edge_count: number;
}

export class Repository {
    constructor(private db: SymbioteDB) {}

    async upsertFile(path: string, hash: string): Promise<void> {
        const now = new Date().toISOString();
        await this.db.run(
            `INSERT INTO files (path, hash, last_scanned)
             VALUES ($1, $2, $3)
             ON CONFLICT(path) DO UPDATE SET hash = $2, last_scanned = $3`,
            path,
            hash,
            now,
        );
    }

    async getFile(filePath: string): Promise<FileRecord | undefined> {
        const rows = await this.db.all<FileRow>('SELECT * FROM files WHERE path = $1', filePath);

        if (rows.length === 0) return undefined;
        const row = rows[0];
        return {
            path: row.path,
            hash: row.hash,
            lastScanned: row.last_scanned,
        };
    }

    async isFileChanged(path: string, currentHash: string): Promise<boolean> {
        const file = await this.getFile(path);
        if (!file) return true;
        return file.hash !== currentHash;
    }

    async insertNodes(nodes: NodeRecord[]): Promise<void> {
        if (nodes.length === 0) return;
        const CHUNK_SIZE = 500;
        await this.db.exec('BEGIN TRANSACTION');
        try {
            for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
                const chunk = nodes.slice(i, i + CHUNK_SIZE);
                const placeholders: string[] = [];
                const params: unknown[] = [];
                for (let j = 0; j < chunk.length; j++) {
                    const offset = j * 7;
                    placeholders.push(
                        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
                    );
                    const node = chunk[j];
                    params.push(
                        node.id,
                        node.type,
                        node.name,
                        node.filePath,
                        node.lineStart,
                        node.lineEnd,
                        JSON.stringify(node.metadata ?? {}),
                    );
                }
                await this.db.run(
                    `INSERT OR REPLACE INTO nodes (id, type, name, file_path, line_start, line_end, metadata)
                     VALUES ${placeholders.join(', ')}`,
                    ...params,
                );
            }
            await this.db.exec('COMMIT');
        } catch (err) {
            await this.db.exec('ROLLBACK');
            throw err;
        }
    }

    async clearNodesForFile(filePath: string): Promise<void> {
        await this.db.run(
            'DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE file_path = $1)',
            filePath,
        );
        await this.db.run(
            'DELETE FROM edges WHERE target_id IN (SELECT id FROM nodes WHERE file_path = $1)',
            filePath,
        );
        await this.db.run('DELETE FROM nodes WHERE file_path = $1', filePath);
    }

    async updateFileNodes(
        filePath: string,
        hash: string,
        nodes: NodeRecord[],
        edges: EdgeRecord[],
    ): Promise<void> {
        await this.db.exec('BEGIN TRANSACTION');
        try {
            await this.db.run(
                'DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE file_path = $1)',
                filePath,
            );
            await this.db.run(
                'DELETE FROM edges WHERE target_id IN (SELECT id FROM nodes WHERE file_path = $1)',
                filePath,
            );
            await this.db.run('DELETE FROM nodes WHERE file_path = $1', filePath);

            if (nodes.length > 0) {
                const CHUNK_SIZE = 500;
                for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
                    const chunk = nodes.slice(i, i + CHUNK_SIZE);
                    const placeholders: string[] = [];
                    const params: unknown[] = [];
                    for (let j = 0; j < chunk.length; j++) {
                        const offset = j * 7;
                        placeholders.push(
                            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
                        );
                        const node = chunk[j];
                        params.push(
                            node.id,
                            node.type,
                            node.name,
                            node.filePath,
                            node.lineStart,
                            node.lineEnd,
                            JSON.stringify(node.metadata ?? {}),
                        );
                    }
                    await this.db.run(
                        `INSERT OR REPLACE INTO nodes (id, type, name, file_path, line_start, line_end, metadata)
                         VALUES ${placeholders.join(', ')}`,
                        ...params,
                    );
                }
            }

            if (edges.length > 0) {
                const CHUNK_SIZE = 500;
                for (let i = 0; i < edges.length; i += CHUNK_SIZE) {
                    const chunk = edges.slice(i, i + CHUNK_SIZE);
                    const placeholders: string[] = [];
                    const params: unknown[] = [];
                    for (let j = 0; j < chunk.length; j++) {
                        const offset = j * 3;
                        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
                        params.push(chunk[j].sourceId, chunk[j].targetId, chunk[j].type);
                    }
                    await this.db.run(
                        `INSERT INTO edges (source_id, target_id, type) VALUES ${placeholders.join(', ')}
                         ON CONFLICT DO NOTHING`,
                        ...params,
                    );
                }
            }

            const now = new Date().toISOString();
            await this.db.run(
                `INSERT INTO files (path, hash, last_scanned)
                 VALUES ($1, $2, $3)
                 ON CONFLICT(path) DO UPDATE SET hash = $2, last_scanned = $3`,
                filePath,
                hash,
                now,
            );

            await this.db.exec('COMMIT');
        } catch (err) {
            await this.db.exec('ROLLBACK');
            throw err;
        }
    }

    async getNodesByFile(filePath: string): Promise<NodeRecord[]> {
        const rows = await this.db.all<NodeRow>(
            'SELECT * FROM nodes WHERE file_path = $1',
            filePath,
        );

        return rows.map(this.mapNodeRow);
    }

    async getNodeById(id: string): Promise<NodeRecord | undefined> {
        const rows = await this.db.all<NodeRow>('SELECT * FROM nodes WHERE id = $1', id);

        if (rows.length === 0) return undefined;
        return this.mapNodeRow(rows[0]);
    }

    async getNodesByIds(ids: string[]): Promise<Map<string, NodeRecord>> {
        if (ids.length === 0) return new Map();
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const rows = await this.db.all<NodeRow>(
            `SELECT * FROM nodes WHERE id IN (${placeholders})`,
            ...ids,
        );
        const map = new Map<string, NodeRecord>();
        for (const row of rows) {
            map.set(row.id, this.mapNodeRow(row));
        }
        return map;
    }

    async searchNodesByName(query: string): Promise<NodeRecord[]> {
        const rows = await this.db.all<NodeRow>(
            'SELECT * FROM nodes WHERE name ILIKE $1 LIMIT 50',
            `%${query}%`,
        );

        return rows.map(this.mapNodeRow);
    }

    async insertEdges(edges: EdgeRecord[]): Promise<void> {
        if (edges.length === 0) return;
        const CHUNK_SIZE = 500;
        await this.db.exec('BEGIN TRANSACTION');
        try {
            for (let i = 0; i < edges.length; i += CHUNK_SIZE) {
                const chunk = edges.slice(i, i + CHUNK_SIZE);
                const placeholders: string[] = [];
                const params: unknown[] = [];
                for (let j = 0; j < chunk.length; j++) {
                    const offset = j * 3;
                    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
                    params.push(chunk[j].sourceId, chunk[j].targetId, chunk[j].type);
                }
                await this.db.run(
                    `INSERT INTO edges (source_id, target_id, type) VALUES ${placeholders.join(', ')}
                     ON CONFLICT DO NOTHING`,
                    ...params,
                );
            }
            await this.db.exec('COMMIT');
        } catch (err) {
            await this.db.exec('ROLLBACK');
            throw err;
        }
    }

    async getDependencies(nodeId: string): Promise<EdgeRecord[]> {
        const rows = await this.db.all<EdgeRow>('SELECT * FROM edges WHERE source_id = $1', nodeId);

        return rows.map(this.mapEdgeRow);
    }

    async getDependents(nodeId: string): Promise<EdgeRecord[]> {
        const rows = await this.db.all<EdgeRow>('SELECT * FROM edges WHERE target_id = $1', nodeId);

        return rows.map(this.mapEdgeRow);
    }

    async getDependenciesBatch(nodeIds: string[]): Promise<EdgeRecord[]> {
        if (nodeIds.length === 0) return [];
        const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(', ');
        const rows = await this.db.all<EdgeRow>(
            `SELECT * FROM edges WHERE source_id IN (${placeholders})`,
            ...nodeIds,
        );
        return rows.map(this.mapEdgeRow);
    }

    async getDependentsBatch(nodeIds: string[]): Promise<EdgeRecord[]> {
        if (nodeIds.length === 0) return [];
        const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(', ');
        const rows = await this.db.all<EdgeRow>(
            `SELECT * FROM edges WHERE target_id IN (${placeholders})`,
            ...nodeIds,
        );
        return rows.map(this.mapEdgeRow);
    }

    async getStats(): Promise<{ nodes: number; edges: number; files: number }> {
        const rows = await this.db.all<StatsRow>(
            `SELECT
                (SELECT COUNT(*) FROM nodes) as nodes,
                (SELECT COUNT(*) FROM edges) as edges,
                (SELECT COUNT(*) FROM files) as files`,
        );
        return {
            nodes: Number(rows[0].nodes),
            edges: Number(rows[0].edges),
            files: Number(rows[0].files),
        };
    }

    async getNodeCountByType(): Promise<Record<string, number>> {
        const rows = await this.db.all<TypeCountRow>(
            'SELECT type, COUNT(*) as count FROM nodes GROUP BY type',
        );

        const result: Record<string, number> = {};
        for (const row of rows) {
            result[row.type] = Number(row.count);
        }
        return result;
    }

    async getHubs(limit: number = 20): Promise<Array<{ node: NodeRecord; edgeCount: number }>> {
        const rows = await this.db.all<HubRow>(
            `SELECT n.*, COUNT(*) as edge_count
             FROM nodes n
             JOIN (
                 SELECT source_id AS node_id FROM edges
                 UNION ALL
                 SELECT target_id AS node_id FROM edges
             ) e ON e.node_id = n.id
             GROUP BY n.id
             ORDER BY edge_count DESC
             LIMIT $1`,
            limit,
        );

        return rows.map((row) => ({
            node: this.mapNodeRow(row),
            edgeCount: Number(row.edge_count),
        }));
    }

    async getAllNodes(): Promise<NodeRecord[]> {
        const rows = await this.db.all<NodeRow>('SELECT * FROM nodes');

        return rows.map(this.mapNodeRow);
    }

    async getAllEdges(): Promise<EdgeRecord[]> {
        const rows = await this.db.all<EdgeRow>('SELECT * FROM edges');

        return rows.map(this.mapEdgeRow);
    }

    private mapNodeRow(row: NodeRow): NodeRecord {
        let metadata: Record<string, unknown> = {};
        try {
            metadata = JSON.parse(row.metadata);
        } catch {
            metadata = {};
        }
        return {
            id: row.id,
            type: row.type,
            name: row.name,
            filePath: row.file_path,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            metadata,
        };
    }

    private mapEdgeRow(row: EdgeRow): EdgeRecord {
        return {
            sourceId: row.source_id,
            targetId: row.target_id,
            type: row.type,
        };
    }
}
