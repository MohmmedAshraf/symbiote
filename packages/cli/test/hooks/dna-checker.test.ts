import { describe, it, expect } from 'vitest';
import { checkDnaViolations } from '#hooks/dna-checker.js';

describe('checkDnaViolations', () => {
    it('detects tabs in edit content', () => {
        const result = checkDnaViolations('\tconst x = 1;', 'server.ts');
        expect(result).toContain('tabs');
        expect(result).toContain('4-space indentation');
    });

    it('detects var usage', () => {
        const result = checkDnaViolations('var x = 1;', 'server.ts');
        expect(result).toContain('var');
    });

    it('returns null for clean code', () => {
        const result = checkDnaViolations('    const x = 1;', 'server.ts');
        expect(result).toBeNull();
    });

    it('skips non-TS/JS files', () => {
        const result = checkDnaViolations('\tkey: value', 'config.yaml');
        expect(result).toBeNull();
    });

    it('detects double quotes as outermost delimiters', () => {
        const result = checkDnaViolations('const x = "hello";', 'server.ts');
        expect(result).toContain('single quotes');
    });

    it('allows double quotes inside single-quoted strings', () => {
        const result = checkDnaViolations('const x = \'He said "hi"\';', 'server.ts');
        expect(result).toBeNull();
    });

    it('skips JSX attribute double quotes', () => {
        const result = checkDnaViolations('<div className="foo">', 'component.tsx');
        expect(result).toBeNull();
    });

    it('skips template literals', () => {
        const result = checkDnaViolations('const x = `hello "world"`;', 'server.ts');
        expect(result).toBeNull();
    });

    it('skips comments', () => {
        const result = checkDnaViolations('// "quoted comment"', 'server.ts');
        expect(result).toBeNull();
    });
});
