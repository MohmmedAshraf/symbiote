import { describe, it, expect } from 'vitest';
import { parseMarkdownRules } from '../../../src/init/parsers/markdown-rules.js';

const SAMPLE_CLAUDE_MD = `
## Architecture

- Use a modular monorepo structure with clear boundaries
- Always separate concerns between data and presentation
- Prefer composition over inheritance in all modules

## Code Style

- Use 4-space indentation everywhere
- Single quotes for all string literals
- Trailing commas in multiline expressions

## Conventions

- Never use \`any\` in TypeScript code
- Avoid deeply nested callbacks

## Decisions

- Chose Vitest over Jest because of native ESM support
- Switched to Drizzle because it has better type safety
`;

describe('parseMarkdownRules', () => {
    it('extracts all bullet rules', () => {
        const rules = parseMarkdownRules(SAMPLE_CLAUDE_MD, 'claude.md');
        expect(rules.length).toBeGreaterThanOrEqual(10);
    });

    it('classifies "never" as anti-pattern', () => {
        const rules = parseMarkdownRules(SAMPLE_CLAUDE_MD, 'claude.md');
        const antiPatterns = rules.filter((r) => r.classification === 'anti-pattern');
        expect(antiPatterns.length).toBeGreaterThanOrEqual(1);
        expect(antiPatterns.some((r) => r.text.toLowerCase().includes('never'))).toBe(true);
    });

    it('classifies "chose/because" as decision', () => {
        const rules = parseMarkdownRules(SAMPLE_CLAUDE_MD, 'claude.md');
        const decisions = rules.filter((r) => r.classification === 'decision');
        expect(decisions.length).toBeGreaterThanOrEqual(2);
        expect(decisions.some((r) => r.text.toLowerCase().includes('chose'))).toBe(true);
        expect(decisions.some((r) => r.text.toLowerCase().includes('because'))).toBe(true);
    });

    it('classifies "use/prefer/always" as constraint', () => {
        const rules = parseMarkdownRules(SAMPLE_CLAUDE_MD, 'claude.md');
        const constraints = rules.filter((r) => r.classification === 'constraint');
        expect(constraints.length).toBeGreaterThanOrEqual(1);
        const texts = constraints.map((r) => r.text.toLowerCase());
        const hasConstraintKeyword = texts.some(
            (t) => t.startsWith('use ') || t.startsWith('prefer ') || t.startsWith('always '),
        );
        expect(hasConstraintKeyword).toBe(true);
    });

    it('classifies remaining rules as style', () => {
        const rules = parseMarkdownRules(SAMPLE_CLAUDE_MD, 'claude.md');
        const styleRules = rules.filter((r) => r.classification === 'style');
        expect(styleRules.length).toBeGreaterThanOrEqual(1);
    });

    it('preserves section names', () => {
        const rules = parseMarkdownRules(SAMPLE_CLAUDE_MD, 'claude.md');
        const sections = new Set(rules.map((r) => r.section).filter(Boolean));
        expect(sections.has('Architecture')).toBe(true);
        expect(sections.has('Code Style')).toBe(true);
        expect(sections.has('Conventions')).toBe(true);
        expect(sections.has('Decisions')).toBe(true);
    });

    it('sets source on all rules', () => {
        const rules = parseMarkdownRules(SAMPLE_CLAUDE_MD, 'claude.md');
        for (const rule of rules) {
            expect(rule.source).toBe('claude.md');
        }
    });

    it('handles empty content', () => {
        const rules = parseMarkdownRules('', 'claude.md');
        expect(rules).toEqual([]);
    });

    it('handles content with no bullets', () => {
        const rules = parseMarkdownRules('## Title\nJust a paragraph.', 'claude.md');
        expect(rules).toEqual([]);
    });
});
