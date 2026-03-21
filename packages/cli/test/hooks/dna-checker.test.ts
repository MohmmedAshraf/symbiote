import { describe, it, expect } from 'vitest';
import { checkDnaViolations } from '#hooks/dna-checker.js';
import type { DnaEntry } from '#dna/schema.js';

function makeDnaEntry(rule: string, category = 'anti-patterns'): DnaEntry {
    return {
        id: rule.slice(0, 20).replace(/\s/g, '-'),
        rule,
        reason: '',
        category,
        applies_to: [],
        source: 'explicit' as const,
        status: 'approved' as const,
        confidence: 0.8,
        evidence: {
            first_seen: '2026-01-01',
            last_seen: '2026-01-01',
            occurrences: 1,
            sessions: 1,
        },
    };
}

describe('checkDnaViolations', () => {
    it('detects violations when keyword matches', () => {
        const entries = [makeDnaEntry('No console.log in production code')];
        const result = checkDnaViolations('console.log("debug");', 'server.ts', entries);
        expect(result).toContain('DNA violation');
        expect(result).toContain('console.log');
    });

    it('returns null when keywords do not match', () => {
        const entries = [makeDnaEntry('No console.log in production code')];
        const result = checkDnaViolations('logger.info("debug");', 'server.ts', entries);
        expect(result).toBeNull();
    });

    it('returns null for empty entries', () => {
        const result = checkDnaViolations('\tvar x = "hello";', 'server.ts', []);
        expect(result).toBeNull();
    });

    it('checks multiple entries and returns first violation', () => {
        const entries = [
            makeDnaEntry('Never use setTimeout directly'),
            makeDnaEntry('No console.log usage'),
        ];
        const result = checkDnaViolations('setTimeout(() => {}, 100);', 'server.ts', entries);
        expect(result).toContain('Never use setTimeout directly');
    });

    it('skips entries that are not anti-patterns category', () => {
        const entries = [makeDnaEntry('Use space indentation, not tabs', 'style')];
        const result = checkDnaViolations('\tconst x = 1;', 'server.ts', entries);
        expect(result).toBeNull();
    });

    it('includes filename in violation message', () => {
        const entries = [makeDnaEntry('Never use eval function calls')];
        const result = checkDnaViolations('eval("alert(1)")', 'src/utils/helper.ts', entries);
        expect(result).toContain('helper.ts');
    });

    it('skips entries with only short words in rule', () => {
        const entries = [makeDnaEntry('No if or do')];
        const result = checkDnaViolations('if (true) do_something();', 'file.ts', entries);
        expect(result).toBeNull();
    });

    it('skips non-anti-patterns entries even with matching keywords', () => {
        const entries = [
            makeDnaEntry('Prefer const over let', 'style'),
            makeDnaEntry('Never use var keyword'),
        ];
        const result = checkDnaViolations('const x = 1;', 'file.ts', entries);
        expect(result).toBeNull();
    });
});
