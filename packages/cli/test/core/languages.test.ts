import { describe, it, expect } from 'vitest';
import {
    detectLanguage,
    getGrammar,
    SUPPORTED_LANGUAGES,
} from '../../src/core/languages.js';

describe('detectLanguage', () => {
    it('detects JavaScript files', () => {
        expect(detectLanguage('src/index.js')).toBe('javascript');
        expect(detectLanguage('src/app.jsx')).toBe('javascript');
        expect(detectLanguage('src/app.mjs')).toBe('javascript');
    });

    it('detects TypeScript files', () => {
        expect(detectLanguage('src/index.ts')).toBe('typescript');
        expect(detectLanguage('src/app.tsx')).toBe('tsx');
    });

    it('detects Python files', () => {
        expect(detectLanguage('src/main.py')).toBe('python');
    });

    it('returns null for unsupported extensions', () => {
        expect(detectLanguage('README.md')).toBeNull();
        expect(detectLanguage('data.csv')).toBeNull();
    });
});

describe('getGrammar', () => {
    it('returns a grammar for JavaScript', () => {
        const grammar = getGrammar('javascript');
        expect(grammar).toBeDefined();
    });

    it('returns a grammar for TypeScript', () => {
        const grammar = getGrammar('typescript');
        expect(grammar).toBeDefined();
    });

    it('returns null for unknown languages', () => {
        const grammar = getGrammar('brainfuck');
        expect(grammar).toBeNull();
    });
});

describe('SUPPORTED_LANGUAGES', () => {
    it('includes tier 1 languages', () => {
        expect(SUPPORTED_LANGUAGES).toContain('javascript');
        expect(SUPPORTED_LANGUAGES).toContain('typescript');
        expect(SUPPORTED_LANGUAGES).toContain('python');
    });
});
