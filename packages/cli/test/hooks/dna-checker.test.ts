import { describe, it, expect } from 'vitest';
import { checkDnaViolations } from '#hooks/dna-checker.js';
import type { DnaEntry } from '#dna/types.js';

function makeDnaEntry(content: string, pattern?: string): DnaEntry {
    return {
        frontmatter: {
            id: content.slice(0, 10),
            confidence: 0.8,
            source: 'explicit',
            status: 'approved',
            category: 'style',
            firstSeen: '2026-01-01',
            lastSeen: '2026-01-01',
            occurrences: 1,
            sessionIds: [],
            pattern,
        },
        content,
    };
}

describe('checkDnaViolations', () => {
    it('detects violations when pattern matches', () => {
        const entries = [makeDnaEntry('No console.log in production code', 'console\\.log')];
        const result = checkDnaViolations('console.log("debug");', 'server.ts', entries);
        expect(result).toContain('DNA violation');
        expect(result).toContain('No console.log');
    });

    it('returns null when pattern does not match', () => {
        const entries = [makeDnaEntry('No console.log in production code', 'console\\.log')];
        const result = checkDnaViolations('logger.info("debug");', 'server.ts', entries);
        expect(result).toBeNull();
    });

    it('returns null when no entries have patterns', () => {
        const entries = [makeDnaEntry('Use 4-space indentation')];
        const result = checkDnaViolations('\tconst x = 1;', 'server.ts', entries);
        expect(result).toBeNull();
    });

    it('returns null for empty entries', () => {
        const result = checkDnaViolations('\tvar x = "hello";', 'server.ts', []);
        expect(result).toBeNull();
    });

    it('checks multiple entries and returns first violation', () => {
        const entries = [
            makeDnaEntry('No var usage', '\\bvar\\s+'),
            makeDnaEntry('No console.log', 'console\\.log'),
        ];
        const result = checkDnaViolations('var x = 1;', 'server.ts', entries);
        expect(result).toContain('No var usage');
    });

    it('detects tab indentation with pattern', () => {
        const entries = [makeDnaEntry('Use space indentation, not tabs', '^\\t')];
        const result = checkDnaViolations('\tconst x = 1;', 'server.ts', entries);
        expect(result).toContain('DNA violation');
        expect(result).toContain('tabs');
    });

    it('detects default exports with pattern', () => {
        const entries = [makeDnaEntry('No default exports', 'export\\s+default')];
        const result = checkDnaViolations('export default function foo() {}', 'mod.ts', entries);
        expect(result).toContain('No default exports');
    });

    it('includes filename in violation message', () => {
        const entries = [makeDnaEntry('No any type', ':\\s*any\\b')];
        const result = checkDnaViolations('const x: any = 1;', 'src/utils/helper.ts', entries);
        expect(result).toContain('helper.ts');
    });

    it('skips entries with invalid regex patterns', () => {
        const entries = [makeDnaEntry('Bad pattern', '[invalid')];
        const result = checkDnaViolations('anything', 'file.ts', entries);
        expect(result).toBeNull();
    });

    it('skips entries without patterns', () => {
        const entries = [
            makeDnaEntry('Prefer const over let'),
            makeDnaEntry('No var usage', '\\bvar\\s+'),
        ];
        const result = checkDnaViolations('const x = 1;', 'file.ts', entries);
        expect(result).toBeNull();
    });
});
