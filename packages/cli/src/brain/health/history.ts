import type { SymbioteDB } from '../../storage/db.js';
import type { HealthSnapshot } from './types.js';

const HEALTH_SNAPSHOTS_SCHEMA = `
    CREATE TABLE IF NOT EXISTS health_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        score INTEGER NOT NULL,
        constraint_score INTEGER NOT NULL,
        circular_dep_score INTEGER NOT NULL,
        dead_code_score INTEGER NOT NULL,
        coupling_score INTEGER NOT NULL,
        constraint_violation_count INTEGER NOT NULL,
        circular_dep_count INTEGER NOT NULL,
        dead_code_count INTEGER NOT NULL,
        coupling_hotspot_count INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
`;

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
    constructor(private db: SymbioteDB) {
        this.db.exec(HEALTH_SNAPSHOTS_SCHEMA);
    }

    save(input: SaveSnapshotInput): void {
        this.db
            .prepare(
                `INSERT INTO health_snapshots
                 (score, constraint_score, circular_dep_score, dead_code_score, coupling_score,
                  constraint_violation_count, circular_dep_count, dead_code_count, coupling_hotspot_count)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                input.score,
                input.constraintScore,
                input.circularDepScore,
                input.deadCodeScore,
                input.couplingScore,
                input.constraintViolationCount,
                input.circularDepCount,
                input.deadCodeCount,
                input.couplingHotspotCount
            );
    }

    list(limit: number): HealthSnapshot[] {
        const rows = this.db
            .prepare(
                'SELECT * FROM health_snapshots ORDER BY id DESC LIMIT ?'
            )
            .all(limit) as Array<{
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
        }>;

        return rows.map((r) => ({
            id: r.id,
            score: r.score,
            constraintScore: r.constraint_score,
            circularDepScore: r.circular_dep_score,
            deadCodeScore: r.dead_code_score,
            couplingScore: r.coupling_score,
            constraintViolationCount:
                r.constraint_violation_count,
            circularDepCount: r.circular_dep_count,
            deadCodeCount: r.dead_code_count,
            couplingHotspotCount: r.coupling_hotspot_count,
            createdAt: r.created_at,
        }));
    }

    latest(): HealthSnapshot | null {
        const rows = this.list(1);
        return rows.length > 0 ? rows[0] : null;
    }
}
