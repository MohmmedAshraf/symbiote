import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createDatabase, type SymbioteDB } from '../../../src/storage/db.js';
import { Repository } from '../../../src/storage/repository.js';
import { IntentStore } from '../../../src/brain/intent.js';
import { Scanner } from '../../../src/core/scanner.js';
import { ConstraintChecker } from '../../../src/brain/health/constraint-checker.js';

const FIXTURES = path.join(
    import.meta.dirname,
    '../../fixtures/health-project'
);

describe('ConstraintChecker', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let intent: IntentStore;
    let checker: ConstraintChecker;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
        const scanner = new Scanner(repo);
        await scanner.scan(path.join(FIXTURES, 'src'));
        intent = new IntentStore(path.join(FIXTURES, '.brain'));
        checker = new ConstraintChecker(repo, intent);
    });

    afterEach(async () => {
        await db.close();
    });

    it('detects violations for constraints with Tree-sitter patterns', async () => {
        const result = await checker.check();
        expect(result.violations.length).toBeGreaterThanOrEqual(
            1
        );

        const sqlViolations = result.violations.filter(
            (v) => v.constraintId === 'constraint-no-raw-sql'
        );
        expect(sqlViolations.length).toBeGreaterThanOrEqual(1);
        expect(sqlViolations[0].filePath).toContain('raw-sql');
    });

    it('includes file path and line info in violations', async () => {
        const result = await checker.check();
        const violation = result.violations[0];
        expect(violation.filePath).toBeDefined();
        expect(violation.lineStart).toBeGreaterThan(0);
        expect(violation.matchedText).toBeDefined();
    });

    it('does not flag clean files', async () => {
        const result = await checker.check();
        const cleanViolations = result.violations.filter((v) =>
            v.filePath.includes('clean')
        );
        expect(cleanViolations).toEqual([]);
    });

    it('separates pattern-based and descriptive constraints', async () => {
        const result = await checker.check();
        expect(result.descriptive).toBeDefined();
        expect(Array.isArray(result.descriptive)).toBe(true);
    });

    it('handles constraints without patterns as descriptive', async () => {
        const tmpBrain = path.join(
            os.tmpdir(),
            `symbiote-constraint-test-${Date.now()}`
        );
        fs.mkdirSync(
            path.join(tmpBrain, 'intent', 'constraints'),
            { recursive: true }
        );
        fs.writeFileSync(
            path.join(
                tmpBrain,
                'intent',
                'constraints',
                'compose-wrappers.md'
            ),
            [
                '---',
                'id: constraint-compose-wrappers',
                'type: constraint',
                'scope: global',
                'status: active',
                'author: mohamed',
                'createdAt: "2026-03-16"',
                '---',
                '',
                'Higher-order wrappers must compose on lower-level ones, not re-implement them.',
            ].join('\n')
        );

        const tmpIntent = new IntentStore(tmpBrain);
        const tmpChecker = new ConstraintChecker(
            repo,
            tmpIntent
        );
        const result = await tmpChecker.check();

        expect(result.descriptive.length).toBe(1);
        expect(result.descriptive[0].constraintId).toBe(
            'constraint-compose-wrappers'
        );

        fs.rmSync(tmpBrain, { recursive: true, force: true });
    });
});
