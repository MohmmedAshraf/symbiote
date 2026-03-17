import type { SymbioteDB } from '../../storage/db.js';
import type { HealthSnapshot } from './types.js';

interface SnapshotRow extends Record<string, unknown> {
    id: number;
    score: number;
    constraint_score: number;
    circular_dep_score: number;
    dead_code_score: number;
    coupling_score: number;
    constraint_violation_count: number;
    circular_dep_count: number;
    dead_code_count: number;
    coupling_hotspot_count: number;
    created_at: string;
}

export interface SaveSnapshotInput {
    score: number;
    constraintScore: number;
    circularDepScore: number;
    deadCodeScore: number;
    couplingScore: number;
    constraintViolationCount: number;
    circularDepCount: number;
    deadCodeCount: number;
    couplingHotspotCount: number;
}

export class HealthHistory {
    constructor(private db: SymbioteDB) {}

    async save(input: SaveSnapshotInput): Promise<void> {
        const now = new Date().toISOString();
        await this.db.run(
            `INSERT INTO health_snapshots
             (score, constraint_score, circular_dep_score, dead_code_score, coupling_score,
              constraint_violation_count, circular_dep_count, dead_code_count, coupling_hotspot_count,
              created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            input.score,
            input.constraintScore,
            input.circularDepScore,
            input.deadCodeScore,
            input.couplingScore,
            input.constraintViolationCount,
            input.circularDepCount,
            input.deadCodeCount,
            input.couplingHotspotCount,
            now,
        );
    }

    async list(limit: number): Promise<HealthSnapshot[]> {
        const rows = await this.db.all<SnapshotRow>(
            'SELECT * FROM health_snapshots ORDER BY id DESC LIMIT $1',
            limit,
        );

        return rows.map((r) => ({
            id: r.id,
            score: r.score,
            constraintScore: r.constraint_score,
            circularDepScore: r.circular_dep_score,
            deadCodeScore: r.dead_code_score,
            couplingScore: r.coupling_score,
            constraintViolationCount: r.constraint_violation_count,
            circularDepCount: r.circular_dep_count,
            deadCodeCount: r.dead_code_count,
            couplingHotspotCount: r.coupling_hotspot_count,
            createdAt: r.created_at,
        }));
    }

    async latest(): Promise<HealthSnapshot | null> {
        const rows = await this.list(1);
        return rows.length > 0 ? rows[0] : null;
    }
}
