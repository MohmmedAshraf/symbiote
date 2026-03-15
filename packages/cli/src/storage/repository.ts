import type { SynapseDB } from './db.js';

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
    constructor(private db: SynapseDB) {}

    upsertFile(path: string, hash: string): void {
        this.db
            .prepare(
                `INSERT INTO files (path, hash, last_scanned)
                 VALUES (?, ?, datetime('now'))
                 ON CONFLICT(path) DO UPDATE SET hash = ?, last_scanned = datetime('now')`
            )
            .run(path, hash, hash);
    }

    getFile(filePath: string): FileRecord | undefined {
        const row = this.db
            .prepare('SELECT * FROM files WHERE path = ?')
            .get(filePath) as
            | { path: string; hash: string; last_scanned: string }
            | undefined;

        if (!row) return undefined;
        return {
            path: row.path,
            hash: row.hash,
            lastScanned: row.last_scanned,
        };
    }

    isFileChanged(path: string, currentHash: string): boolean {
        const file = this.getFile(path);
        if (!file) return true;
        return file.hash !== currentHash;
    }

    insertNodes(nodes: NodeRecord[]): void {
        const stmt = this.db.prepare(
            `INSERT OR REPLACE INTO nodes (id, type, name, file_path, line_start, line_end, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        const insertMany = this.db.transaction((items: NodeRecord[]) => {
            for (const node of items) {
                stmt.run(
                    node.id,
                    node.type,
                    node.name,
                    node.filePath,
                    node.lineStart,
                    node.lineEnd,
                    JSON.stringify(node.metadata ?? {})
                );
            }
        });

        insertMany(nodes);
    }

    clearNodesForFile(filePath: string): void {
        this.db
            .prepare(
                'DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE file_path = ?)'
            )
            .run(filePath);
        this.db
            .prepare(
                'DELETE FROM edges WHERE target_id IN (SELECT id FROM nodes WHERE file_path = ?)'
            )
            .run(filePath);
        this.db.prepare('DELETE FROM nodes WHERE file_path = ?').run(filePath);
    }

    getNodesByFile(filePath: string): NodeRecord[] {
        const rows = this.db
            .prepare('SELECT * FROM nodes WHERE file_path = ?')
            .all(filePath) as NodeRow[];

        return rows.map(this.mapNodeRow);
    }

    getNodeById(id: string): NodeRecord | undefined {
        const row = this.db
            .prepare('SELECT * FROM nodes WHERE id = ?')
            .get(id) as NodeRow | undefined;

        if (!row) return undefined;
        return this.mapNodeRow(row);
    }

    searchNodesByName(query: string): NodeRecord[] {
        const rows = this.db
            .prepare(
                'SELECT * FROM nodes WHERE name LIKE ? COLLATE NOCASE LIMIT 50'
            )
            .all(`%${query}%`) as NodeRow[];

        return rows.map(this.mapNodeRow);
    }

    insertEdges(edges: EdgeRecord[]): void {
        const stmt = this.db.prepare(
            'INSERT OR IGNORE INTO edges (source_id, target_id, type) VALUES (?, ?, ?)'
        );

        const insertMany = this.db.transaction((items: EdgeRecord[]) => {
            for (const edge of items) {
                stmt.run(edge.sourceId, edge.targetId, edge.type);
            }
        });

        insertMany(edges);
    }

    getDependencies(nodeId: string): EdgeRecord[] {
        const rows = this.db
            .prepare('SELECT * FROM edges WHERE source_id = ?')
            .all(nodeId) as EdgeRow[];

        return rows.map(this.mapEdgeRow);
    }

    getDependents(nodeId: string): EdgeRecord[] {
        const rows = this.db
            .prepare('SELECT * FROM edges WHERE target_id = ?')
            .all(nodeId) as EdgeRow[];

        return rows.map(this.mapEdgeRow);
    }

    getStats(): { nodes: number; edges: number; files: number } {
        const nodes = (
            this.db.prepare('SELECT COUNT(*) as count FROM nodes').get() as {
                count: number;
            }
        ).count;
        const edges = (
            this.db.prepare('SELECT COUNT(*) as count FROM edges').get() as {
                count: number;
            }
        ).count;
        const files = (
            this.db.prepare('SELECT COUNT(*) as count FROM files').get() as {
                count: number;
            }
        ).count;
        return { nodes, edges, files };
    }

    getNodeCountByType(): Record<string, number> {
        const rows = this.db
            .prepare('SELECT type, COUNT(*) as count FROM nodes GROUP BY type')
            .all() as Array<{ type: string; count: number }>;

        const result: Record<string, number> = {};
        for (const row of rows) {
            result[row.type] = row.count;
        }
        return result;
    }

    getAllNodes(): NodeRecord[] {
        const rows = this.db
            .prepare('SELECT * FROM nodes')
            .all() as NodeRow[];

        return rows.map(this.mapNodeRow);
    }

    getAllEdges(): EdgeRecord[] {
        const rows = this.db
            .prepare('SELECT * FROM edges')
            .all() as EdgeRow[];

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
