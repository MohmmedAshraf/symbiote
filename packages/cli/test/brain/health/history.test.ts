import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SymbioteDB } from '../../../src/storage/db.js';
import { HealthHistory } from '../../../src/brain/health/history.js';

describe('HealthHistory', () => {
    let db: SymbioteDB;
    let history: HealthHistory;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        history = new HealthHistory(db);
    });

    afterEach(async () => {
        await db.close();
    });

    it('creates the health_snapshots table on init', async () => {
        const tables = (await db.all(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_name = 'health_snapshots'",
        )) as { table_name: string }[];
        expect(tables.length).toBe(1);
    });

    it('saves a health snapshot', async () => {
        await history.save({
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

        const snapshots = await history.list(10);
        expect(snapshots.length).toBe(1);
        expect(snapshots[0].score).toBe(85);
        expect(snapshots[0].constraintViolationCount).toBe(1);
    });

    it('retrieves snapshots in reverse chronological order', async () => {
        await history.save({
            score: 80,
            constraintScore: 80,
            circularDepScore: 100,
            deadCodeScore: 90,
            couplingScore: 70,
            constraintViolationCount: 1,
            circularDepCount: 0,
            deadCodeCount: 2,
            couplingHotspotCount: 3,
        });
        await history.save({
            score: 90,
            constraintScore: 100,
            circularDepScore: 100,
            deadCodeScore: 90,
            couplingScore: 70,
            constraintViolationCount: 0,
            circularDepCount: 0,
            deadCodeCount: 2,
            couplingHotspotCount: 3,
        });

        const snapshots = await history.list(10);
        expect(snapshots.length).toBe(2);
        expect(snapshots[0].score).toBe(90);
        expect(snapshots[1].score).toBe(80);
    });

    it('respects the limit parameter', async () => {
        for (let i = 0; i < 5; i++) {
            await history.save({
                score: 50 + i * 10,
                constraintScore: 100,
                circularDepScore: 100,
                deadCodeScore: 100,
                couplingScore: 100,
                constraintViolationCount: 0,
                circularDepCount: 0,
                deadCodeCount: 0,
                couplingHotspotCount: 0,
            });
        }

        const snapshots = await history.list(3);
        expect(snapshots.length).toBe(3);
    });

    it('returns latest snapshot or null', async () => {
        expect(await history.latest()).toBeNull();

        await history.save({
            score: 75,
            constraintScore: 80,
            circularDepScore: 100,
            deadCodeScore: 60,
            couplingScore: 60,
            constraintViolationCount: 1,
            circularDepCount: 0,
            deadCodeCount: 8,
            couplingHotspotCount: 4,
        });

        const latest = await history.latest();
        expect(latest).toBeDefined();
        expect(latest!.score).toBe(75);
    });

    it('assigns auto-incrementing ids', async () => {
        await history.save({
            score: 80,
            constraintScore: 80,
            circularDepScore: 100,
            deadCodeScore: 90,
            couplingScore: 70,
            constraintViolationCount: 1,
            circularDepCount: 0,
            deadCodeCount: 2,
            couplingHotspotCount: 3,
        });
        await history.save({
            score: 90,
            constraintScore: 100,
            circularDepScore: 100,
            deadCodeScore: 90,
            couplingScore: 70,
            constraintViolationCount: 0,
            circularDepCount: 0,
            deadCodeCount: 2,
            couplingHotspotCount: 3,
        });

        const snapshots = await history.list(10);
        expect(snapshots[0].id).toBeGreaterThan(snapshots[1].id);
    });
});
