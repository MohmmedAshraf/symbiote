import { describe, it, expect } from 'vitest';
import { parseEslintConfig } from '#init/parsers/eslint-config.js';

describe('parseEslintConfig', () => {
    it('classifies error rules as constraints', () => {
        const rules = parseEslintConfig({
            rules: { 'no-unused-vars': 'error', 'no-console': 'error' },
        });
        const constraints = rules.filter((r) => r.classification === 'constraint');
        expect(constraints.length).toBe(2);
        expect(constraints[0].text).toContain('no-unused-vars');
        expect(constraints[0].text).toContain('error');
    });

    it('classifies warn rules as style', () => {
        const rules = parseEslintConfig({
            rules: { 'prefer-const': 'warn' },
        });
        const style = rules.filter((r) => r.classification === 'style');
        expect(style.length).toBe(1);
        expect(style[0].text).toContain('prefer-const');
        expect(style[0].text).toContain('warn');
    });

    it('handles array-format configs', () => {
        const rules = parseEslintConfig({
            rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
        });
        expect(rules.length).toBe(1);
        expect(rules[0].classification).toBe('constraint');
        expect(rules[0].text).toContain('no-unused-vars');
    });

    it('classifies extends as decisions', () => {
        const rules = parseEslintConfig({
            extends: ['eslint:recommended', 'plugin:@typescript-eslint/strict'],
        });
        const decisions = rules.filter((r) => r.classification === 'decision');
        expect(decisions.length).toBe(1);
        expect(decisions[0].text).toContain('eslint:recommended');
    });

    it('sets source to eslint', () => {
        const rules = parseEslintConfig({
            rules: { semi: 'error' },
        });
        for (const rule of rules) {
            expect(rule.source).toBe('eslint');
        }
    });

    it('handles empty config', () => {
        const rules = parseEslintConfig({});
        expect(rules).toEqual([]);
    });

    it('handles null rules', () => {
        const rules = parseEslintConfig({ rules: undefined });
        expect(rules).toEqual([]);
    });
});
