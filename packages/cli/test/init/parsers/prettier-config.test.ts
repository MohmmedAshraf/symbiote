import { describe, it, expect } from 'vitest';
import { parsePrettierConfig } from '../../../src/init/parsers/prettier-config.js';

describe('parsePrettierConfig', () => {
    it('parses semicolons setting', () => {
        const rules = parsePrettierConfig({ semi: true });
        expect(rules.some((r) => r.text === 'Semicolons required')).toBe(true);

        const noSemi = parsePrettierConfig({ semi: false });
        expect(noSemi.some((r) => r.text === 'No semicolons')).toBe(true);
    });

    it('parses quote style', () => {
        const rules = parsePrettierConfig({ singleQuote: true });
        expect(rules.some((r) => r.text === 'Single quotes')).toBe(true);

        const doubleQuotes = parsePrettierConfig({ singleQuote: false });
        expect(doubleQuotes.some((r) => r.text === 'Double quotes')).toBe(true);
    });

    it('parses tab width', () => {
        const rules = parsePrettierConfig({ tabWidth: 4 });
        expect(rules.some((r) => r.text === 'Tab width: 4')).toBe(true);
    });

    it('parses trailing comma', () => {
        const rules = parsePrettierConfig({ trailingComma: 'all' });
        expect(rules.some((r) => r.text === 'Trailing commas: all')).toBe(true);
    });

    it('parses print width', () => {
        const rules = parsePrettierConfig({ printWidth: 100 });
        expect(rules.some((r) => r.text === 'Print width: 100')).toBe(true);
    });

    it('classifies all rules as style', () => {
        const rules = parsePrettierConfig({
            semi: true,
            singleQuote: true,
            tabWidth: 4,
            trailingComma: 'all',
            printWidth: 100,
        });
        expect(rules.length).toBe(5);
        for (const rule of rules) {
            expect(rule.classification).toBe('style');
        }
    });

    it('sets source to prettier', () => {
        const rules = parsePrettierConfig({ semi: true });
        for (const rule of rules) {
            expect(rule.source).toBe('prettier');
        }
    });

    it('handles empty config', () => {
        const rules = parsePrettierConfig({});
        expect(rules).toEqual([]);
    });
});
