import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SynapseDB } from '../../../src/storage/db.js';
import { HealthHistory } from '../../../src/brain/health/history.js';

describe('HealthHistory', () => {
    let db: SynapseDB;
    let history: HealthHistory;

    beforeEach(() => {
        db = createDatabase(':memory:');
        history = new HealthHistory(db);
    });

    afterEach(() => {
        db.close();
    });

    it('creates the health_snapshots table on init', () => {
        const tables = db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='health_snapshots'"
            )
            .all() as { name: string }[];
        expect(tables.length).toBe(1);
    });

    it('saves a health snapshot', () => {
        history.save({
            score: 85,
            constraintScore: 80,
            circularDepScore: 100,
            deadCodeScore: 90,
            couplingScore: 70,
            constraintViolationCount: 1,
            circularDepCount: 0,
            deadCodeCount: 2,
            couplingHotspotCount: 3,
        });

        const snapshots = history.list(10);
        expect(snapshots.length).toBe(1);
        expect(snapshots[0].score).toBe(85);
        expect(snapshots[0].constraintViolationCount).toBe(1);
    });

    it('retrieves snapshots in reverse chronological order', () => {
        history.save({ score: 80, constraintScore: 80, circularDepScore: 100, deadCodeScore: 90, couplingScore: 70, constraintViolationCount: 1, circularDepCount: 0, deadCodeCount: 2, couplingHotspotCount: 3 });
        history.save({ score: 90, constraintScore: 100, circularDepScore: 100, deadCodeScore: 90, couplingScore: 70, constraintViolationCount: 0, circularDepCount: 0, deadCodeCount: 2, couplingHotspotCount: 3 });

        const snapshots = history.list(10);
        expect(snapshots.length).toBe(2);
        expect(snapshots[0].score).toBe(90);
        expect(snapshots[1].score).toBe(80);
    });

    it('respects the limit parameter', () => {
        for (let i = 0; i < 5; i++) {
            history.save({ score: 50 + i * 10, constraintScore: 100, circularDepScore: 100, deadCodeScore: 100, couplingScore: 100, constraintViolationCount: 0, circularDepCount: 0, deadCodeCount: 0, couplingHotspotCount: 0 });
        }

        const snapshots = history.list(3);
        expect(snapshots.length).toBe(3);
    });

    it('returns latest snapshot or null', () => {
        expect(history.latest()).toBeNull();

        history.save({ score: 75, constraintScore: 80, circularDepScore: 100, deadCodeScore: 60, couplingScore: 60, constraintViolationCount: 1, circularDepCount: 0, deadCodeCount: 8, couplingHotspotCount: 4 });

        const latest = history.latest();
        expect(latest).toBeDefined();
        expect(latest!.score).toBe(75);
    });

    it('assigns auto-incrementing ids', () => {
        history.save({ score: 80, constraintScore: 80, circularDepScore: 100, deadCodeScore: 90, couplingScore: 70, constraintViolationCount: 1, circularDepCount: 0, deadCodeCount: 2, couplingHotspotCount: 3 });
        history.save({ score: 90, constraintScore: 100, circularDepScore: 100, deadCodeScore: 90, couplingScore: 70, constraintViolationCount: 0, circularDepCount: 0, deadCodeCount: 2, couplingHotspotCount: 3 });

        const snapshots = history.list(10);
        expect(snapshots[0].id).toBeGreaterThan(snapshots[1].id);
    });
});
