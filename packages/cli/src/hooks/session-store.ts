import type { SymbioteDB } from '#storage/db.js';

export interface SessionRow extends Record<string, unknown> {
    session_id: string;
    started_at: number;
    ended_at: number | null;
    reason: string | null;
    files_touched: string | null;
    symbols_modified: string | null;
    tool_counts: string | null;
    failure_count: number;
    interaction_count: number;
}

export interface ObservationRow extends Record<string, unknown> {
    id: number;
    session_id: string;
    timestamp: number;
    tool_name: string;
    event: string;
    file_path: string | null;
    symbols_affected: string | null;
    metadata: string | null;
}

export interface EndSessionInput {
    endedAt: number;
    reason?: string;
    filesTouched?: string[];
    symbolsModified?: string[];
    toolCounts?: Record<string, number>;
    failureCount?: number;
    interactionCount?: number;
}

export interface RecordObservationInput {
    sessionId: string;
    timestamp: number;
    toolName: string;
    event: string;
    filePath?: string;
    symbolsAffected?: string[];
    metadata?: Record<string, unknown>;
}

export class SessionStore {
    constructor(private db: SymbioteDB) {}

    async startSession(sessionId: string, startedAt: number): Promise<void> {
        await this.db.run(
            `INSERT INTO sessions (session_id, started_at)
             VALUES ($1, $2)
             ON CONFLICT (session_id) DO NOTHING`,
            sessionId,
            startedAt,
        );
    }

    async endSession(sessionId: string, input: EndSessionInput): Promise<void> {
        await this.db.run(
            `UPDATE sessions SET
                ended_at = $1,
                reason = $2,
                files_touched = $3,
                symbols_modified = $4,
                tool_counts = $5,
                failure_count = $6,
                interaction_count = $7
             WHERE session_id = $8`,
            input.endedAt,
            input.reason ?? null,
            input.filesTouched ? JSON.stringify(input.filesTouched) : null,
            input.symbolsModified ? JSON.stringify(input.symbolsModified) : null,
            input.toolCounts ? JSON.stringify(input.toolCounts) : null,
            input.failureCount ?? 0,
            input.interactionCount ?? 0,
            sessionId,
        );
    }

    async getSession(sessionId: string): Promise<SessionRow | null> {
        const rows = await this.db.all<SessionRow>(
            'SELECT * FROM sessions WHERE session_id = $1',
            sessionId,
        );
        return rows[0] ?? null;
    }

    async recordObservation(input: RecordObservationInput): Promise<void> {
        await this.db.run(
            `INSERT INTO session_observations
                (session_id, timestamp, tool_name, event, file_path, symbols_affected, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            input.sessionId,
            input.timestamp,
            input.toolName,
            input.event,
            input.filePath ?? null,
            input.symbolsAffected ? JSON.stringify(input.symbolsAffected) : null,
            input.metadata ? JSON.stringify(input.metadata) : null,
        );
    }

    async getObservations(sessionId: string): Promise<ObservationRow[]> {
        return this.db.all<ObservationRow>(
            'SELECT * FROM session_observations WHERE session_id = $1 ORDER BY timestamp ASC',
            sessionId,
        );
    }

    async getToolCounts(sessionId: string): Promise<Record<string, number>> {
        const rows = await this.db.all<{ tool_name: string; count: number }>(
            `SELECT tool_name, COUNT(*) AS count
             FROM session_observations
             WHERE session_id = $1
             GROUP BY tool_name`,
            sessionId,
        );
        const result: Record<string, number> = {};
        for (const row of rows) {
            result[row.tool_name] = Number(row.count);
        }
        return result;
    }

    async getHotspots(sessionId: string, threshold: number): Promise<string[]> {
        const rows = await this.db.all<{ file_path: string; edit_count: number }>(
            `SELECT file_path, COUNT(*) AS edit_count
             FROM session_observations
             WHERE session_id = $1
               AND event = 'file:edit'
               AND file_path IS NOT NULL
             GROUP BY file_path
             HAVING COUNT(*) >= $2`,
            sessionId,
            threshold,
        );
        return rows.map((r) => r.file_path);
    }

    async saveSnapshot(sessionId: string, snapshot: string): Promise<void> {
        await this.db.run(
            `INSERT INTO session_snapshots (session_id, snapshot)
             VALUES ($1, $2)
             ON CONFLICT (session_id) DO UPDATE SET snapshot = excluded.snapshot`,
            sessionId,
            snapshot,
        );
    }

    async getSnapshot(sessionId: string): Promise<string | null> {
        const rows = await this.db.all<{ snapshot: string }>(
            'SELECT snapshot FROM session_snapshots WHERE session_id = $1',
            sessionId,
        );
        return rows[0]?.snapshot ?? null;
    }

    async getSessionCount(): Promise<number> {
        const rows = await this.db.all<{ count: number }>('SELECT COUNT(*) AS count FROM sessions');
        return Number(rows[0]?.count ?? 0);
    }
}
