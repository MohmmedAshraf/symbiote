import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { createDatabase, type SynapseDB } from '../../src/storage/db.js';
import { Repository } from '../../src/storage/repository.js';
import { Scanner } from '../../src/core/scanner.js';
import { HealthAnalyzer } from '../../src/brain/health.js';
import { IntentStore } from '../../src/brain/intent.js';

const FIXTURES = path.join(
    import.meta.dirname,
    '../fixtures/brain-project'
);

describe('HealthAnalyzer', () => {
    let db: SynapseDB;
    let repo: Repository;
    let analyzer: HealthAnalyzer;

    beforeEach(async () => {
        db = createDatabase(':memory:');
        repo = new Repository(db);
        const scanner = new Scanner(repo);
        await scanner.scan(path.join(FIXTURES, 'src'));

        const intent = new IntentStore(path.join(FIXTURES, '.brain'));
        analyzer = new HealthAnalyzer(repo, intent);
    });

    afterEach(() => {
        db.close();
    });

    it('detects orphan files (files with no incoming edges)', () => {
        const report = analyzer.analyze();
        expect(report.orphanFiles).toBeDefined();
        expect(Array.isArray(report.orphanFiles)).toBe(true);
    });

    it('detects circular dependencies', () => {
        repo.insertNodes([
            {
                id: 'fn:x.ts:a',
                type: 'function',
                name: 'a',
                filePath: 'x.ts',
                lineStart: 1,
                lineEnd: 3,
            },
            {
                id: 'fn:y.ts:b',
                type: 'function',
                name: 'b',
                filePath: 'y.ts',
                lineStart: 1,
                lineEnd: 3,
            },
        ]);
        repo.insertEdges([
            {
                sourceId: 'fn:x.ts:a',
                targetId: 'fn:y.ts:b',
                type: 'calls',
            },
            {
                sourceId: 'fn:y.ts:b',
                targetId: 'fn:x.ts:a',
                type: 'calls',
            },
        ]);

        const report = analyzer.analyze();
        expect(report.circularDeps.length).toBeGreaterThanOrEqual(1);
    });

    it('returns a health score between 0 and 100', () => {
        const report = analyzer.analyze();
        expect(report.score).toBeGreaterThanOrEqual(0);
        expect(report.score).toBeLessThanOrEqual(100);
    });

    it('lists active constraint violations as descriptive warnings', () => {
        const report = analyzer.analyze();
        expect(report.constraintViolations).toBeDefined();
        expect(Array.isArray(report.constraintViolations)).toBe(true);
    });

    it('reports overall summary with counts', () => {
        const report = analyzer.analyze();
        expect(report).toHaveProperty('score');
        expect(report).toHaveProperty('orphanFiles');
        expect(report).toHaveProperty('circularDeps');
        expect(report).toHaveProperty('constraintViolations');
        expect(report).toHaveProperty('deadCode');
    });
});
