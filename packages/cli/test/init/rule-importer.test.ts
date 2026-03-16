import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { importRules } from '../../src/init/rule-importer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../fixtures/init-project');
const EMPTY_DIR = resolve(__dirname, '../fixtures/simple-project');

describe('importRules', () => {
    it('finds and parses CLAUDE.md rules', () => {
        const rules = importRules(FIXTURE_DIR);
        const claudeRules = rules.filter((r) => r.source === 'CLAUDE.md');
        expect(claudeRules.length).toBeGreaterThan(0);
    });

    it('finds and parses .cursorrules', () => {
        const rules = importRules(FIXTURE_DIR);
        const cursorRules = rules.filter((r) => r.source === '.cursorrules');
        expect(cursorRules.length).toBeGreaterThan(0);
    });

    it('finds and parses .eslintrc.json', () => {
        const rules = importRules(FIXTURE_DIR);
        const eslintRules = rules.filter((r) => r.source === 'eslint');
        expect(eslintRules.length).toBeGreaterThan(0);
    });

    it('finds and parses tsconfig.json', () => {
        const rules = importRules(FIXTURE_DIR);
        const tsRules = rules.filter((r) => r.source === 'tsconfig');
        expect(tsRules.length).toBeGreaterThan(0);
    });

    it('finds and parses package.json', () => {
        const rules = importRules(FIXTURE_DIR);
        const pkgRules = rules.filter((r) => r.source === 'package.json');
        expect(pkgRules.length).toBeGreaterThan(0);
    });

    it('finds and parses .prettierrc', () => {
        const rules = importRules(FIXTURE_DIR);
        const prettierRules = rules.filter((r) => r.source === 'prettier');
        expect(prettierRules.length).toBeGreaterThan(0);
    });

    it('assigns constraints and decisions to intent layer', () => {
        const rules = importRules(FIXTURE_DIR);
        const intentRules = rules.filter((r) => r.target === 'intent');
        expect(intentRules.length).toBeGreaterThan(0);
        for (const rule of intentRules) {
            expect(['constraint', 'decision']).toContain(rule.classification);
        }
    });

    it('assigns style and anti-pattern rules to dna layer', () => {
        const rules = importRules(FIXTURE_DIR);
        const dnaRules = rules.filter((r) => r.target === 'dna');
        expect(dnaRules.length).toBeGreaterThan(0);
        for (const rule of dnaRules) {
            expect(['style', 'anti-pattern']).toContain(rule.classification);
        }
    });

    it('returns empty array for directory with no configs', () => {
        const rules = importRules(EMPTY_DIR);
        expect(rules).toEqual([]);
    });
});
