import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { createDatabase, type SymbioteDB } from '../../../src/storage/db.js';
import { Repository } from '../../../src/storage/repository.js';
import { Scanner } from '../../../src/core/scanner.js';
import { IntentStore } from '../../../src/brain/intent.js';
import { HealthEngine } from '../../../src/brain/health/index.js';

const FIXTURES = path.join(
    import.meta.dirname,
    '../../fixtures/brain-project'
);

describe('HealthEngine', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let engine: HealthEngine;

    beforeEach(async () => {
        db = createDatabase(':memory:');
        repo = new Repository(db);
        const scanner = new Scanner(repo);
        await scanner.scan(path.join(FIXTURES, 'src'));

        const intent = new IntentStore(
            path.join(FIXTURES, '.brain')
        );
        engine = new HealthEngine(repo, intent, db);
    });

    afterEach(() => {
        db.close();
    });

    it('produces a complete health report', () => {
        const report = engine.analyze();
        expect(report.score).toBeGreaterThanOrEqual(0);
        expect(report.score).toBeLessThanOrEqual(100);
        expect(report.categories).toBeDefined();
        expect(report.timestamp).toBeDefined();
    });

    it('populates all report arrays', () => {
        const report = engine.analyze();
        expect(Array.isArray(report.constraintViolations)).toBe(true);
        expect(Array.isArray(report.descriptiveConstraints)).toBe(true);
        expect(Array.isArray(report.circularDeps)).toBe(true);
        expect(Array.isArray(report.deadCode)).toBe(true);
        expect(Array.isArray(report.couplingHotspots)).toBe(true);
    });

    it('saves a snapshot when saveSnapshot is called', () => {
        const report = engine.analyze();
        engine.saveSnapshot(report);

        const history = engine.getHistory(10);
        expect(history.length).toBe(1);
        expect(history[0].score).toBe(report.score);
    });

    it('detects circular deps when manually added', () => {
        repo.insertNodes([
            { id: 'fn:x.ts:a', type: 'function', name: 'a', filePath: 'x.ts', lineStart: 1, lineEnd: 3 },
            { id: 'fn:y.ts:b', type: 'function', name: 'b', filePath: 'y.ts', lineStart: 1, lineEnd: 3 },
        ]);
        repo.insertEdges([
            { sourceId: 'fn:x.ts:a', targetId: 'fn:y.ts:b', type: 'calls' },
            { sourceId: 'fn:y.ts:b', targetId: 'fn:x.ts:a', type: 'calls' },
        ]);

        const report = engine.analyze();
        expect(report.circularDeps.length).toBeGreaterThanOrEqual(1);
    });

    it('returns score between 0 and 100 even with many issues', () => {
        for (let i = 0; i < 50; i++) {
            repo.insertNodes([
                { id: `fn:orphan${i}.ts:fn${i}`, type: 'function', name: `fn${i}`, filePath: `orphan${i}.ts`, lineStart: 1, lineEnd: 3 },
            ]);
        }

        const report = engine.analyze();
        expect(report.score).toBeGreaterThanOrEqual(0);
        expect(report.score).toBeLessThanOrEqual(100);
    });
});
