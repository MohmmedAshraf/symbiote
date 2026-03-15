import { describe, it, expect } from 'vitest';
import {
    type DnaEntry,
    DNA_CATEGORIES,
    DNA_STATUSES,
    parseFrontmatter,
    serializeEntry,
} from '../../src/dna/types.js';

describe('DNA_CATEGORIES', () => {
    it('includes all four categories', () => {
        expect(DNA_CATEGORIES).toEqual([
            'style',
            'preferences',
            'anti-patterns',
            'decisions',
        ]);
    });
});

describe('DNA_STATUSES', () => {
    it('includes suggested, approved, rejected', () => {
        expect(DNA_STATUSES).toEqual(['suggested', 'approved', 'rejected']);
    });
});

describe('parseFrontmatter', () => {
    it('parses a valid DNA entry markdown string', () => {
        const raw = `---
id: style-early-returns
confidence: 0.95
source: correction
status: approved
category: style
firstSeen: "2026-03-10"
lastSeen: "2026-03-16"
occurrences: 12
sessionIds:
  - "session-1"
  - "session-2"
---

Use early returns to exit functions. Never nest logic inside else blocks after a return statement.`;

        const result = parseFrontmatter(raw);
        expect(result).toBeDefined();
        expect(result!.frontmatter.id).toBe('style-early-returns');
        expect(result!.frontmatter.confidence).toBe(0.95);
        expect(result!.frontmatter.source).toBe('correction');
        expect(result!.frontmatter.status).toBe('approved');
        expect(result!.frontmatter.category).toBe('style');
        expect(result!.frontmatter.occurrences).toBe(12);
        expect(result!.frontmatter.sessionIds).toEqual([
            'session-1',
            'session-2',
        ]);
        expect(result!.content).toBe(
            'Use early returns to exit functions. Never nest logic inside else blocks after a return statement.'
        );
    });

    it('returns null for invalid markdown without frontmatter', () => {
        const result = parseFrontmatter(
            'Just plain text without frontmatter.'
        );
        expect(result).toBeNull();
    });

    it('returns null for empty input', () => {
        const result = parseFrontmatter('');
        expect(result).toBeNull();
    });
});

describe('serializeEntry', () => {
    it('serializes a DNA entry back to markdown', () => {
        const entry: DnaEntry = {
            frontmatter: {
                id: 'style-early-returns',
                confidence: 0.95,
                source: 'correction',
                status: 'approved',
                category: 'style',
                firstSeen: '2026-03-10',
                lastSeen: '2026-03-16',
                occurrences: 12,
                sessionIds: ['session-1', 'session-2'],
            },
            content:
                'Use early returns to exit functions. Never nest logic inside else blocks after a return statement.',
        };

        const serialized = serializeEntry(entry);
        expect(serialized).toContain('---');
        expect(serialized).toContain('id: style-early-returns');
        expect(serialized).toContain('confidence: 0.95');
        expect(serialized).toContain('status: approved');
        expect(serialized).toContain('category: style');
        expect(serialized).toContain(
            'Use early returns to exit functions.'
        );

        const reparsed = parseFrontmatter(serialized);
        expect(reparsed).toBeDefined();
        expect(reparsed!.frontmatter.id).toBe('style-early-returns');
        expect(reparsed!.content).toBe(entry.content);
    });
});
