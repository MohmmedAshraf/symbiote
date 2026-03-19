import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '#storage/db.js';
import { createCortexSchema } from '#cortex/schema.js';
import { CortexRepository } from '#cortex/repository.js';
import { CortexEngine } from '#cortex/engine.js';

const TOPOLOGY = resolve(__dirname, '../fixtures/cortex/topology');

describe('Full Pipeline Integration (Stages 0-7)', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;
    let engine: CortexEngine;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        engine = new CortexEngine(repo);
    });

    afterEach(async () => {
        await db.close();
    });

    it('runs all 8 stages end-to-end', async () => {
        const result = await engine.run({ rootDir: TOPOLOGY });
        expect(result.stages).toHaveLength(8);
        expect(result.maxDepth).toBe(7);
        expect(result.totalNodes).toBeGreaterThan(0);
        expect(result.totalEdges).toBeGreaterThan(0);
        expect(result.totalDurationMs).toBeGreaterThan(0);
    });

    it('all files reach depth_level 7', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const files = await repo.getAllFileNodes();
        for (const file of files) {
            expect(file.depthLevel).toBe(7);
        }
    });

    it('topology metadata is populated', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const fns = await repo.getAllFunctions();
        const withCommunity = fns.filter((f) => f.community !== null);
        expect(withCommunity.length).toBeGreaterThan(0);
        const withPageRank = fns.filter((f) => f.pageRank !== null);
        expect(withPageRank.length).toBeGreaterThan(0);
    });

    it('execution flows are stored', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const flows = await repo.getFlowsByEntryPoint('fn:controller.ts:handleGetUser');
        expect(flows.length).toBeGreaterThan(0);
        for (const flow of flows) {
            expect(flow.entryPointId).toBeTruthy();
            expect(flow.nodeIds.length).toBeGreaterThan(0);
        }
    });

    it('findings are generated and stored', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const raw = await repo.getMeta('findings');
        expect(raw).toBeTruthy();
        const findings = JSON.parse(raw!);
        expect(Array.isArray(findings)).toBe(true);
    });

    it('temporal snapshot is saved', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const snapshots = await db.all(
            'SELECT * FROM cortex_temporal_snapshots ORDER BY timestamp DESC LIMIT $1',
            1,
        );
        expect(snapshots.length).toBe(1);
    });

    it('architecture metadata is stored', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const communityCount = await repo.getMeta('community_count');
        expect(communityCount).toBeTruthy();
        expect(parseInt(communityCount!, 10)).toBeGreaterThan(0);
    });

    it('incremental second run skips stages 0-5', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const second = await engine.run({ rootDir: TOPOLOGY });
        for (let i = 0; i <= 5; i++) {
            expect(second.stages[i].filesProcessed).toBe(0);
        }
    });

    it('stages 6-7 re-run on second pass (topology is always recomputed)', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const second = await engine.run({ rootDir: TOPOLOGY });
        expect(second.stages[6].filesProcessed).toBeGreaterThan(0);
        expect(second.stages[7].filesProcessed).toBeGreaterThan(0);
    });

    it('force re-run processes all files', async () => {
        await engine.run({ rootDir: TOPOLOGY });
        const forced = await engine.run({ rootDir: TOPOLOGY, force: true });
        expect(forced.totalFiles).toBeGreaterThan(0);
    });
});
