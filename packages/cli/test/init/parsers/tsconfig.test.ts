import { describe, it, expect } from 'vitest';
import { parseTsConfig } from '../../../src/init/parsers/tsconfig.js';

describe('parseTsConfig', () => {
    it('classifies strict mode as constraint', () => {
        const rules = parseTsConfig({
            compilerOptions: { strict: true },
        });
        const constraints = rules.filter((r) => r.classification === 'constraint');
        expect(constraints.length).toBe(1);
        expect(constraints[0].text).toBe('strict: enabled');
    });

    it('classifies strict sub-flags as constraints', () => {
        const rules = parseTsConfig({
            compilerOptions: {
                noImplicitAny: true,
                strictNullChecks: true,
                noImplicitReturns: true,
            },
        });
        const constraints = rules.filter((r) => r.classification === 'constraint');
        expect(constraints.length).toBe(3);
        expect(constraints.every((r) => r.text.endsWith(': enabled'))).toBe(true);
    });

    it('classifies module as decision', () => {
        const rules = parseTsConfig({
            compilerOptions: { module: 'esnext' },
        });
        const decisions = rules.filter((r) => r.classification === 'decision');
        expect(decisions.some((r) => r.text === 'module: esnext')).toBe(true);
    });

    it('classifies target as decision', () => {
        const rules = parseTsConfig({
            compilerOptions: { target: 'es2022' },
        });
        const decisions = rules.filter((r) => r.classification === 'decision');
        expect(decisions.some((r) => r.text === 'target: es2022')).toBe(true);
    });

    it('classifies path aliases as style', () => {
        const rules = parseTsConfig({
            compilerOptions: {
                paths: { '@/*': ['./src/*'] },
            },
        });
        const style = rules.filter((r) => r.classification === 'style');
        expect(style.length).toBe(1);
        expect(style[0].text).toContain('@/*');
        expect(style[0].text).toContain('./src/*');
    });

    it('sets source to tsconfig', () => {
        const rules = parseTsConfig({
            compilerOptions: { strict: true, target: 'es2022' },
        });
        for (const rule of rules) {
            expect(rule.source).toBe('tsconfig');
        }
    });

    it('handles empty config', () => {
        const rules = parseTsConfig({});
        expect(rules).toEqual([]);
    });
});
