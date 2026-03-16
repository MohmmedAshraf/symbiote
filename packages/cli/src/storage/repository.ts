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

interface NodeRow {
    id: string;
    type: string;
    name: string;
    file_path: string;
    line_start: number;
    line_end: number;
    metadata: string;
}

interface EdgeRow {
    source_id: string;
    target_id: string;
    type: string;
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
        const rows = await this.db.all('SELECT * FROM files WHERE path = $1', filePath);

        if (rows.length === 0) return undefined;
        const row = rows[0] as { path: string; hash: string; last_scanned: string };
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
        for (const node of nodes) {
            await this.db.run(
                `INSERT OR REPLACE INTO nodes (id, type, name, file_path, line_start, line_end, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                node.id,
                node.type,
                node.name,
                node.filePath,
                node.lineStart,
                node.lineEnd,
                JSON.stringify(node.metadata ?? {}),
            );
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

    async getNodesByFile(filePath: string): Promise<NodeRecord[]> {
        const rows = (await this.db.all(
            'SELECT * FROM nodes WHERE file_path = $1',
            filePath,
        )) as unknown as NodeRow[];

        return rows.map(this.mapNodeRow);
    }

    async getNodeById(id: string): Promise<NodeRecord | undefined> {
        const rows = (await this.db.all(
            'SELECT * FROM nodes WHERE id = $1',
            id,
        )) as unknown as NodeRow[];

        if (rows.length === 0) return undefined;
        return this.mapNodeRow(rows[0]);
    }

    async searchNodesByName(query: string): Promise<NodeRecord[]> {
        const rows = (await this.db.all(
            'SELECT * FROM nodes WHERE name ILIKE $1 LIMIT 50',
            `%${query}%`,
        )) as unknown as NodeRow[];

        return rows.map(this.mapNodeRow);
    }

    async insertEdges(edges: EdgeRecord[]): Promise<void> {
        for (const edge of edges) {
            await this.db.run(
                `INSERT INTO edges (source_id, target_id, type) VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                edge.sourceId,
                edge.targetId,
                edge.type,
            );
        }
    }

    async getDependencies(nodeId: string): Promise<EdgeRecord[]> {
        const rows = (await this.db.all(
            'SELECT * FROM edges WHERE source_id = $1',
            nodeId,
        )) as unknown as EdgeRow[];

        return rows.map(this.mapEdgeRow);
    }

    async getDependents(nodeId: string): Promise<EdgeRecord[]> {
        const rows = (await this.db.all(
            'SELECT * FROM edges WHERE target_id = $1',
            nodeId,
        )) as unknown as EdgeRow[];

        return rows.map(this.mapEdgeRow);
    }

    async getStats(): Promise<{ nodes: number; edges: number; files: number }> {
        const nodeResult = await this.db.all('SELECT COUNT(*) as count FROM nodes');
        const edgeResult = await this.db.all('SELECT COUNT(*) as count FROM edges');
        const fileResult = await this.db.all('SELECT COUNT(*) as count FROM files');

        return {
            nodes: Number((nodeResult[0] as { count: number | bigint }).count),
            edges: Number((edgeResult[0] as { count: number | bigint }).count),
            files: Number((fileResult[0] as { count: number | bigint }).count),
        };
    }

    async getNodeCountByType(): Promise<Record<string, number>> {
        const rows = (await this.db.all(
            'SELECT type, COUNT(*) as count FROM nodes GROUP BY type',
        )) as Array<{ type: string; count: number | bigint }>;

        const result: Record<string, number> = {};
        for (const row of rows) {
            result[row.type] = Number(row.count);
        }
        return result;
    }

    async getAllNodes(): Promise<NodeRecord[]> {
        const rows = (await this.db.all('SELECT * FROM nodes')) as unknown as NodeRow[];

        return rows.map(this.mapNodeRow);
    }

    async getAllEdges(): Promise<EdgeRecord[]> {
        const rows = (await this.db.all('SELECT * FROM edges')) as unknown as EdgeRow[];

        return rows.map(this.mapEdgeRow);
    }

    private mapNodeRow(row: NodeRow): NodeRecord {
        return {
            id: row.id,
            type: row.type,
            name: row.name,
            filePath: row.file_path,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            metadata: JSON.parse(row.metadata),
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
