import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { IntentStore } from '#brain/intent.js';
import { HealthEngine } from '#brain/health/index.js';
import { CortexRepository } from '#cortex/repository.js';
import { CortexEngine } from '#cortex/engine.js';

const FIXTURES = path.join(import.meta.dirname, '../../fixtures/brain-project');

describe('HealthEngine', () => {
    let db: SymbioteDB;
    let cortexRepo: CortexRepository;
    let engine: HealthEngine;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        cortexRepo = new CortexRepository(db);
        const cortexEngine = new CortexEngine(cortexRepo);
        await cortexEngine.run({
            rootDir: path.join(FIXTURES, 'src'),
            force: true,
        });

        const intent = new IntentStore(path.join(FIXTURES, '.brain'));
        engine = new HealthEngine(cortexRepo, intent, db);
    });

    afterEach(async () => {
        await db.close();
    });

    it('produces a complete health report', async () => {
        const report = await engine.analyze();
        expect(report.score).toBeGreaterThanOrEqual(0);
        expect(report.score).toBeLessThanOrEqual(100);
        expect(report.categories).toBeDefined();
        expect(report.timestamp).toBeDefined();
    });

    it('populates all report arrays', async () => {
        const report = await engine.analyze();
        expect(Array.isArray(report.constraintViolations)).toBe(true);
        expect(Array.isArray(report.descriptiveConstraints)).toBe(true);
        expect(Array.isArray(report.circularDeps)).toBe(true);
        expect(Array.isArray(report.deadCode)).toBe(true);
        expect(Array.isArray(report.couplingHotspots)).toBe(true);
    });

    it('saves a snapshot when saveSnapshot is called', async () => {
        const report = await engine.analyze();
        await engine.saveSnapshot(report);

        const history = await engine.getHistory(10);
        expect(history.length).toBe(1);
        expect(history[0].score).toBe(report.score);
    });

    it('detects circular deps when present in cortex', async () => {
        await cortexRepo.insertFunctionNodes([
            {
                id: 'fn:x.ts:a',
                name: 'a',
                qualifiedName: 'a',
                filePath: 'x.ts',
                lineStart: 1,
                lineEnd: 3,
                isAsync: false,
                isExported: true,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: null,
                community: null,
                pageRank: null,
                betweenness: null,
            },
            {
                id: 'fn:y.ts:b',
                name: 'b',
                qualifiedName: 'b',
                filePath: 'y.ts',
                lineStart: 1,
                lineEnd: 3,
                isAsync: false,
                isExported: true,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: null,
                community: null,
                pageRank: null,
                betweenness: null,
            },
        ]);
        await cortexRepo.insertImportsEdges([
            {
                sourceId: 'fn:x.ts:a',
                targetId: 'fn:y.ts:b',
                line: 1,
                kind: 'named',
                originalName: 'b',
                alias: null,
                confidence: 1,
                stage: 0,
                reason: null,
            },
            {
                sourceId: 'fn:y.ts:b',
                targetId: 'fn:x.ts:a',
                line: 1,
                kind: 'named',
                originalName: 'a',
                alias: null,
                confidence: 1,
                stage: 0,
                reason: null,
            },
        ]);

        const report = await engine.analyze();
        expect(report.circularDeps.length).toBeGreaterThanOrEqual(1);
    });

    it('returns score between 0 and 100 even with many issues', async () => {
        const nodes = Array.from({ length: 50 }, (_, i) => ({
            id: `fn:orphan${i}.ts:fn${i}`,
            name: `fn${i}`,
            qualifiedName: `fn${i}`,
            filePath: `orphan${i}.ts`,
            lineStart: 1,
            lineEnd: 3,
            isAsync: false,
            isExported: true,
            isEntryPoint: false,
            entryPointScore: 0,
            signature: null,
            community: null,
            pageRank: null,
            betweenness: null,
        }));
        await cortexRepo.insertFunctionNodes(nodes);

        const report = await engine.analyze();
        expect(report.score).toBeGreaterThanOrEqual(0);
        expect(report.score).toBeLessThanOrEqual(100);
    });
});
