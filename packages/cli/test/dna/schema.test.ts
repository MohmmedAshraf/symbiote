import { describe, it, expect } from 'vitest';
import { DnaEntrySchema, DnaProfileSchema } from '#dna/schema.js';

describe('DnaEntrySchema', () => {
    it('validates a complete entry', () => {
        const input = {
            id: 'style-early-returns',
            rule: 'Use early returns instead of nested else blocks',
            reason: 'Reduces nesting and improves readability',
            category: 'style',
            applies_to: ['typescript', 'javascript'],
            source: 'correction' as const,
            status: 'approved' as const,
            confidence: 0.95,
            evidence: {
                first_seen: '2026-03-10',
                last_seen: '2026-03-16',
                occurrences: 12,
                sessions: 5,
            },
            origin: {
                session_id: 'sess-abc',
                file: 'src/utils/parser.ts',
                context: 'code review',
            },
        };

        const result = DnaEntrySchema.parse(input);
        expect(result.id).toBe('style-early-returns');
        expect(result.rule).toBe('Use early returns instead of nested else blocks');
        expect(result.reason).toBe('Reduces nesting and improves readability');
        expect(result.category).toBe('style');
        expect(result.applies_to).toEqual(['typescript', 'javascript']);
        expect(result.source).toBe('correction');
        expect(result.status).toBe('approved');
        expect(result.confidence).toBe(0.95);
        expect(result.evidence.occurrences).toBe(12);
        expect(result.origin?.session_id).toBe('sess-abc');
    });

    it('fills defaults for optional fields', () => {
        const result = DnaEntrySchema.parse({
            id: 'pref-semicolons',
            rule: 'Always use semicolons',
        });

        expect(result.reason).toBe('');
        expect(result.category).toBe('general');
        expect(result.applies_to).toEqual([]);
        expect(result.source).toBe('correction');
        expect(result.status).toBe('suggested');
        expect(result.confidence).toBe(0.3);
        expect(result.evidence.occurrences).toBe(1);
        expect(result.evidence.sessions).toBe(0);
        expect(result.origin).toBeUndefined();
    });

    it('rejects entry without rule', () => {
        expect(() => DnaEntrySchema.parse({ id: 'no-rule' })).toThrow();
    });
});

describe('DnaProfileSchema', () => {
    it('validates a complete profile', () => {
        const input = {
            version: 1 as const,
            profile: {
                name: 'Mohamed Ashraf',
                handle: 'MohmmedAshraf',
                bio: 'Full-stack developer',
                created: '2026-03-10',
                updated: '2026-03-21',
            },
            entries: [
                {
                    id: 'style-early-returns',
                    rule: 'Use early returns',
                    reason: 'Cleaner code',
                    category: 'style',
                    applies_to: ['typescript'],
                    source: 'correction' as const,
                    status: 'approved' as const,
                    confidence: 0.95,
                    evidence: {
                        first_seen: '2026-03-10',
                        last_seen: '2026-03-16',
                        occurrences: 12,
                        sessions: 5,
                    },
                },
            ],
            stats: {
                total_entries: 1,
                categories: ['style'],
                top_languages: ['typescript'],
                oldest_entry: '2026-03-10',
                total_sessions: 5,
            },
        };

        const result = DnaProfileSchema.parse(input);
        expect(result.version).toBe(1);
        expect(result.profile.name).toBe('Mohamed Ashraf');
        expect(result.entries).toHaveLength(1);
        expect(result.stats.total_entries).toBe(1);
    });

    it('rejects profile with wrong version', () => {
        const input = {
            version: 2,
            profile: {
                name: 'Test',
                handle: 'test',
                created: '2026-03-10',
                updated: '2026-03-21',
            },
            entries: [],
            stats: {
                total_entries: 0,
                categories: [],
                top_languages: [],
                oldest_entry: null,
                total_sessions: 0,
            },
        };

        expect(() => DnaProfileSchema.parse(input)).toThrow();
    });
});
