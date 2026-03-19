import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { Repository } from '#storage/repository.js';
import { IntentStore } from '#brain/intent.js';
import { Scanner } from '#core/scanner.js';
import { ConstraintChecker } from '#brain/health/constraint-checker.js';

const FIXTURES = path.join(import.meta.dirname, '../../fixtures/health-project');

describe('ConstraintChecker', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let intent: IntentStore;
    let checker: ConstraintChecker;
    let allFilePaths: Set<string>;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
        const scanner = new Scanner(repo);
        await scanner.scan(path.join(FIXTURES, 'src'));
        intent = new IntentStore(path.join(FIXTURES, '.brain'));
        checker = new ConstraintChecker(intent);

        const allNodes = await repo.getAllNodes();
        allFilePaths = new Set(allNodes.map((n) => n.filePath));
    });

    afterEach(async () => {
        await db.close();
    });

    it('detects violations for constraints with Tree-sitter patterns', async () => {
        const result = await checker.check(allFilePaths);
        expect(result.violations.length).toBeGreaterThanOrEqual(1);

        const sqlViolations = result.violations.filter(
            (v) => v.constraintId === 'constraint-no-raw-sql',
        );
        expect(sqlViolations.length).toBeGreaterThanOrEqual(1);
        expect(sqlViolations[0].filePath).toContain('raw-sql');
    });

    it('includes file path and line info in violations', async () => {
        const result = await checker.check(allFilePaths);
        const violation = result.violations[0];
        expect(violation.filePath).toBeDefined();
        expect(violation.lineStart).toBeGreaterThan(0);
        expect(violation.matchedText).toBeDefined();
    });

    it('does not flag clean files', async () => {
        const result = await checker.check(allFilePaths);
        const cleanViolations = result.violations.filter((v) => v.filePath.includes('clean'));
        expect(cleanViolations).toEqual([]);
    });

    it('separates pattern-based and descriptive constraints', async () => {
        const result = await checker.check(allFilePaths);
        expect(result.descriptive).toBeDefined();
        expect(Array.isArray(result.descriptive)).toBe(true);
    });

    it('handles constraints without patterns as descriptive', async () => {
        const tmpBrain = path.join(os.tmpdir(), `symbiote-constraint-test-${Date.now()}`);
        fs.mkdirSync(path.join(tmpBrain, 'intent', 'constraints'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpBrain, 'intent', 'constraints', 'compose-wrappers.md'),
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
            ].join('\n'),
        );

        const tmpIntent = new IntentStore(tmpBrain);
        const tmpChecker = new ConstraintChecker(tmpIntent);
        const result = await tmpChecker.check(allFilePaths);

        expect(result.descriptive.length).toBe(1);
        expect(result.descriptive[0].constraintId).toBe('constraint-compose-wrappers');

        fs.rmSync(tmpBrain, { recursive: true, force: true });
    });
});
