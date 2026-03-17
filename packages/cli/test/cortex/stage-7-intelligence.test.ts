import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '#storage/db.js';
import { createCortexSchema } from '#cortex/schema.js';
import { CortexRepository } from '#cortex/repository.js';
import { CortexEngine } from '#cortex/engine.js';
import { runStage6 } from '#cortex/stage-6-topology.js';
import { runStage7, collectFindings, saveTemporalSnapshot } from '#cortex/stage-7-intelligence.js';
import type { Finding } from '#cortex/topology-types.js';

const TOPOLOGY = resolve(__dirname, '../fixtures/cortex/topology');

describe('Stage 7: Intelligence (Batch)', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
    });

    afterEach(async () => {
        await db.close();
    });

    describe('collectFindings', () => {
        it('runs all pattern detectors and aggregates findings', async () => {
            const engine = new CortexEngine(repo);
            await engine.run({ rootDir: TOPOLOGY });
            await runStage6(repo, TOPOLOGY);
            const findings = await collectFindings(repo);
            expect(Array.isArray(findings)).toBe(true);
        });

        it('returns typed Finding objects', async () => {
            const engine = new CortexEngine(repo);
            await engine.run({ rootDir: TOPOLOGY });
            await runStage6(repo, TOPOLOGY);
            const findings = await collectFindings(repo);
            for (const f of findings) {
                expect(f.kind).toBeDefined();
                expect(f.severity).toBeDefined();
                expect(f.message).toBeTruthy();
                expect(Array.isArray(f.nodeIds)).toBe(true);
                expect(Array.isArray(f.filePaths)).toBe(true);
            }
        });
    });

    describe('saveTemporalSnapshot', () => {
        it('saves a snapshot with current graph metrics', async () => {
            const engine = new CortexEngine(repo);
            await engine.run({ rootDir: TOPOLOGY });
            await runStage6(repo, TOPOLOGY);
            await saveTemporalSnapshot(repo, 'test-commit-hash');
            const snapshots = await repo.getTemporalSnapshots(1);
            expect(snapshots).toHaveLength(1);
            expect(snapshots[0].commitHash).toBe('test-commit-hash');
            expect(Object.keys(snapshots[0].nodeCounts).length).toBeGreaterThan(0);
        });

        it('includes top PageRank nodes', async () => {
            const engine = new CortexEngine(repo);
            await engine.run({ rootDir: TOPOLOGY });
            await runStage6(repo, TOPOLOGY);
            await saveTemporalSnapshot(repo, 'snapshot-2');
            const snapshots = await repo.getTemporalSnapshots(1);
            expect(snapshots[0].topPagerank.length).toBeGreaterThan(0);
        });
    });

    describe('runStage7 (full)', () => {
        it('produces findings and stores temporal snapshot', async () => {
            const engine = new CortexEngine(repo);
            await engine.run({ rootDir: TOPOLOGY });
            await runStage6(repo, TOPOLOGY);
            const result = await runStage7(repo, TOPOLOGY);
            expect(result.stage).toBe(7);
            expect(result.durationMs).toBeGreaterThan(0);
        });

        it('updates depth_level to 7', async () => {
            const engine = new CortexEngine(repo);
            await engine.run({ rootDir: TOPOLOGY });
            await runStage6(repo, TOPOLOGY);
            await runStage7(repo, TOPOLOGY);
            const file = await repo.getFileNode('file:controller.ts');
            expect(file!.depthLevel).toBe(7);
        });

        it('stores findings in cortex_meta', async () => {
            const engine = new CortexEngine(repo);
            await engine.run({ rootDir: TOPOLOGY });
            await runStage6(repo, TOPOLOGY);
            await runStage7(repo, TOPOLOGY);
            const raw = await repo.getMeta('findings');
            expect(raw).toBeTruthy();
            const findings: Finding[] = JSON.parse(raw!);
            expect(Array.isArray(findings)).toBe(true);
        });

        it('skips if no files at depth >= 6', async () => {
            const result = await runStage7(repo, TOPOLOGY);
            expect(result.filesProcessed).toBe(0);
        });
    });
});
