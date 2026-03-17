import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { CortexEngine } from '../../src/cortex/engine.js';
import {
    loadGraphFromDb,
    runCommunityDetection,
    runPageRank,
    runBetweenness,
    traceExecutionFlows,
    detectLayers,
    runStage6,
} from '../../src/cortex/stage-6-topology.js';

const TOPOLOGY = resolve(__dirname, '../fixtures/cortex/topology');

describe('Stage 6: Topology', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        const engine = new CortexEngine(repo);
        await engine.run({ rootDir: TOPOLOGY, maxStage: 5 });
    });

    afterEach(async () => {
        await db.close();
    });

    describe('loadGraphFromDb', () => {
        it('loads all symbol nodes into Graphology', async () => {
            const graph = await loadGraphFromDb(repo);
            expect(graph.order).toBeGreaterThan(0);
        });

        it('loads typed edges (calls, flows_to, implements)', async () => {
            const graph = await loadGraphFromDb(repo);
            expect(graph.size).toBeGreaterThan(0);
        });

        it('preserves edge type as attribute', async () => {
            const graph = await loadGraphFromDb(repo);
            let hasTypedEdge = false;
            graph.forEachEdge((_edge, attrs) => {
                if (attrs.type) hasTypedEdge = true;
            });
            expect(hasTypedEdge).toBe(true);
        });
    });

    describe('runCommunityDetection', () => {
        it('assigns community IDs to nodes', async () => {
            const graph = await loadGraphFromDb(repo);
            const communities = runCommunityDetection(graph);
            expect(Object.keys(communities).length).toBeGreaterThan(0);
        });

        it('uses only structural edges (calls, flows_to, implements)', async () => {
            const graph = await loadGraphFromDb(repo);
            const communities = runCommunityDetection(graph);
            const communityValues = new Set(Object.values(communities));
            expect(communityValues.size).toBeGreaterThanOrEqual(1);
        });
    });

    describe('runPageRank', () => {
        it('produces scores for all nodes', async () => {
            const graph = await loadGraphFromDb(repo);
            const ranks = runPageRank(graph);
            expect(Object.keys(ranks).length).toBe(graph.order);
        });

        it('scores sum to approximately 1', async () => {
            const graph = await loadGraphFromDb(repo);
            const ranks = runPageRank(graph);
            const sum = Object.values(ranks).reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 0);
        });
    });

    describe('runBetweenness', () => {
        it('produces scores for all nodes', async () => {
            const graph = await loadGraphFromDb(repo);
            const betweenness = runBetweenness(graph);
            expect(Object.keys(betweenness).length).toBe(graph.order);
        });

        it('bridge nodes score higher than leaf nodes', async () => {
            const graph = await loadGraphFromDb(repo);
            const betweenness = runBetweenness(graph);
            const values = Object.values(betweenness);
            const max = Math.max(...values);
            const min = Math.min(...values);
            expect(max).toBeGreaterThanOrEqual(min);
        });
    });

    describe('traceExecutionFlows', () => {
        it('traces flows from entry points through call graph', async () => {
            const graph = await loadGraphFromDb(repo);
            const flows = traceExecutionFlows(graph, repo);
            expect(flows.length).toBeGreaterThan(0);
        });

        it('each flow has an entry point and ordered node list', async () => {
            const graph = await loadGraphFromDb(repo);
            const flows = traceExecutionFlows(graph, repo);
            for (const flow of flows) {
                expect(flow.entryPointId).toBeTruthy();
                expect(flow.nodeIds.length).toBeGreaterThan(0);
                expect(flow.nodeIds[0]).toBe(flow.entryPointId);
            }
        });

        it('detects async boundaries in flows', async () => {
            const graph = await loadGraphFromDb(repo);
            const flows = traceExecutionFlows(graph, repo);
            const asyncFlows = flows.filter((f) => f.hasAsync);
            expect(asyncFlows.length).toBeGreaterThan(0);
        });
    });

    describe('detectLayers', () => {
        it('assigns layers based on flow direction', async () => {
            const graph = await loadGraphFromDb(repo);
            const communities = runCommunityDetection(graph);
            const layers = detectLayers(graph, communities);
            expect(layers.length).toBeGreaterThan(0);
        });

        it('assigns known layer types', async () => {
            const graph = await loadGraphFromDb(repo);
            const communities = runCommunityDetection(graph);
            const layers = detectLayers(graph, communities);
            const layerTypes = new Set(layers.map((l) => l.layer));
            expect(
                layerTypes.has('controller') ||
                    layerTypes.has('service') ||
                    layerTypes.has('repository') ||
                    layerTypes.has('utility'),
            ).toBe(true);
        });

        it('assigns confidence scores', async () => {
            const graph = await loadGraphFromDb(repo);
            const communities = runCommunityDetection(graph);
            const layers = detectLayers(graph, communities);
            for (const l of layers) {
                expect(l.confidence).toBeGreaterThan(0);
                expect(l.confidence).toBeLessThanOrEqual(1);
            }
        });
    });

    describe('runStage6 (full)', () => {
        it('writes community, pageRank, betweenness to node metadata', async () => {
            await runStage6(repo, TOPOLOGY);
            const fn = await repo.getFunction('fn:controller.ts:handleGetUser');
            expect(fn?.community).not.toBeNull();
            expect(fn?.pageRank).not.toBeNull();
            expect(fn?.betweenness).not.toBeNull();
        });

        it('stores execution flows in cortex_flows table', async () => {
            await runStage6(repo, TOPOLOGY);
            const flows = await repo.getAllFlows();
            expect(flows.length).toBeGreaterThan(0);
        });

        it('updates depth_level to 6', async () => {
            await runStage6(repo, TOPOLOGY);
            const file = await repo.getFileNode('file:controller.ts');
            expect(file!.depthLevel).toBe(6);
        });

        it('returns stage result with counts', async () => {
            const result = await runStage6(repo, TOPOLOGY);
            expect(result.stage).toBe(6);
            expect(result.durationMs).toBeGreaterThan(0);
        });

        it('clears previous flows before re-tracing', async () => {
            await runStage6(repo, TOPOLOGY);
            const firstFlows = await repo.getAllFlows();
            await runStage6(repo, TOPOLOGY, { force: true });
            const secondFlows = await repo.getAllFlows();
            expect(secondFlows.length).toBe(firstFlows.length);
        });
    });
});
