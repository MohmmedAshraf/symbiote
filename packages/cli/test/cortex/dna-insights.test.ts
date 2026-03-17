import { describe, it, expect } from 'vitest';
import {
    detectStyleDeviations,
    detectDecisionContradictions,
    predictImpact,
} from '#cortex/stage-7-intelligence.js';
import type { DnaEntry } from '#dna/types.js';

describe('DNA-Informed Insights', () => {
    describe('detectStyleDeviations', () => {
        it('flags nodes that violate DNA style patterns', () => {
            const dnaEntries: DnaEntry[] = [
                {
                    frontmatter: {
                        id: 'dna-001',
                        confidence: 0.9,
                        source: 'explicit',
                        status: 'approved',
                        category: 'style',
                        firstSeen: '2026-01-01',
                        lastSeen: '2026-03-17',
                        occurrences: 50,
                        sessionIds: [],
                    },
                    content: 'Use async/await instead of .then() chains',
                },
            ];

            const nodePatterns = [
                {
                    nodeId: 'fn:old.ts:fetchData',
                    filePath: 'old.ts',
                    usesPromiseChains: true,
                    usesAsyncAwait: false,
                },
            ];

            const findings = detectStyleDeviations(dnaEntries, nodePatterns);
            expect(findings).toHaveLength(1);
            expect(findings[0].kind).toBe('style_deviation');
        });

        it('ignores rejected DNA entries', () => {
            const dnaEntries: DnaEntry[] = [
                {
                    frontmatter: {
                        id: 'dna-002',
                        confidence: 0.9,
                        source: 'explicit',
                        status: 'rejected',
                        category: 'style',
                        firstSeen: '2026-01-01',
                        lastSeen: '2026-03-17',
                        occurrences: 50,
                        sessionIds: [],
                    },
                    content: 'Some rejected style rule',
                },
            ];

            const nodePatterns = [
                {
                    nodeId: 'fn:x.ts:y',
                    filePath: 'x.ts',
                    usesPromiseChains: true,
                    usesAsyncAwait: false,
                },
            ];

            const findings = detectStyleDeviations(dnaEntries, nodePatterns);
            expect(findings).toHaveLength(0);
        });
    });

    describe('detectDecisionContradictions', () => {
        it('flags patterns that contradict approved decisions', () => {
            const dnaEntries: DnaEntry[] = [
                {
                    frontmatter: {
                        id: 'dec-001',
                        confidence: 0.95,
                        source: 'explicit',
                        status: 'approved',
                        category: 'decisions',
                        firstSeen: '2026-01-01',
                        lastSeen: '2026-03-17',
                        occurrences: 1,
                        sessionIds: [],
                    },
                    content: 'Use repository pattern for all database access',
                },
            ];

            const observedPatterns = [
                {
                    nodeId: 'fn:ctrl.ts:directQuery',
                    filePath: 'ctrl.ts',
                    pattern: 'direct_db_access',
                    description: 'Controller directly calls database query function',
                },
            ];

            const findings = detectDecisionContradictions(dnaEntries, observedPatterns);
            expect(findings).toHaveLength(1);
            expect(findings[0].kind).toBe('decision_contradiction');
        });
    });

    describe('predictImpact', () => {
        it('suggests co-change files based on historical patterns', () => {
            const changeHistory = [
                { file: 'service.ts', changedWith: ['repository.ts', 'types.ts'] },
                { file: 'service.ts', changedWith: ['repository.ts', 'types.ts'] },
                { file: 'service.ts', changedWith: ['repository.ts'] },
            ];

            const currentFile = 'service.ts';
            const findings = predictImpact(changeHistory, currentFile, { minCoOccurrence: 2 });
            expect(findings).toHaveLength(1);
            expect(findings[0].kind).toBe('predictive_impact');
            expect(findings[0].filePaths).toContain('repository.ts');
            expect(findings[0].filePaths).toContain('types.ts');
        });

        it('returns empty when no strong co-change pattern exists', () => {
            const changeHistory = [
                { file: 'service.ts', changedWith: ['a.ts'] },
                { file: 'service.ts', changedWith: ['b.ts'] },
                { file: 'service.ts', changedWith: ['c.ts'] },
            ];

            const findings = predictImpact(changeHistory, 'service.ts', { minCoOccurrence: 2 });
            expect(findings).toHaveLength(0);
        });
    });
});
