import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RealTimeEnrichment } from '#cortex/real-time-enrichment.js';
import type { AttentionWeight, InvestigationContext } from '#cortex/topology-types.js';

describe('RealTimeEnrichment', () => {
    let enrichment: RealTimeEnrichment;

    beforeEach(() => {
        vi.useFakeTimers();
        enrichment = new RealTimeEnrichment();
    });

    afterEach(() => {
        enrichment.dispose();
        vi.useRealTimers();
    });

    describe('attention weights', () => {
        it('boosts attention on file read', () => {
            enrichment.onFileRead('src/service.ts', ['fn:service.ts:create']);
            const weight = enrichment.getAttentionWeight('fn:service.ts:create');
            expect(weight).toBeGreaterThan(0);
        });

        it('accumulates attention on repeated reads', () => {
            enrichment.onFileRead('src/service.ts', ['fn:service.ts:create']);
            const first = enrichment.getAttentionWeight('fn:service.ts:create');
            enrichment.onFileRead('src/service.ts', ['fn:service.ts:create']);
            const second = enrichment.getAttentionWeight('fn:service.ts:create');
            expect(second).toBeGreaterThan(first);
        });

        it('caps attention at maximum weight', () => {
            for (let i = 0; i < 100; i++) {
                enrichment.onFileRead('src/service.ts', ['fn:service.ts:create']);
            }
            const weight = enrichment.getAttentionWeight('fn:service.ts:create');
            expect(weight).toBeLessThanOrEqual(1.0);
        });

        it('decays attention over time', () => {
            enrichment.onFileRead('src/service.ts', ['fn:service.ts:create']);
            const initial = enrichment.getAttentionWeight('fn:service.ts:create');
            vi.advanceTimersByTime(60_000);
            enrichment.tick();
            const decayed = enrichment.getAttentionWeight('fn:service.ts:create');
            expect(decayed).toBeLessThan(initial);
        });

        it('returns 0 for unknown nodes', () => {
            const weight = enrichment.getAttentionWeight('fn:unknown.ts:missing');
            expect(weight).toBe(0);
        });
    });

    describe('investigation context', () => {
        it('infers investigation scope from recent reads', () => {
            enrichment.onFileRead('src/user/service.ts', ['fn:user/service.ts:create']);
            enrichment.onFileRead('src/user/repository.ts', ['fn:user/repository.ts:save']);
            enrichment.onFileRead('src/user/controller.ts', ['fn:user/controller.ts:handleCreate']);
            const context = enrichment.getInvestigationContext();
            expect(context.recentFiles).toContain('src/user/service.ts');
            expect(context.recentFiles).toContain('src/user/repository.ts');
        });

        it('infers directory scope from file patterns', () => {
            enrichment.onFileRead('src/auth/login.ts', ['fn:auth/login.ts:login']);
            enrichment.onFileRead('src/auth/session.ts', ['fn:auth/session.ts:create']);
            enrichment.onFileRead('src/auth/token.ts', ['fn:auth/token.ts:generate']);
            const context = enrichment.getInvestigationContext();
            expect(context.inferredScope).toContain('src/auth');
        });

        it('limits recent files to configured window', () => {
            for (let i = 0; i < 50; i++) {
                enrichment.onFileRead(`src/file-${i}.ts`, [`fn:file-${i}.ts:fn`]);
            }
            const context = enrichment.getInvestigationContext();
            expect(context.recentFiles.length).toBeLessThanOrEqual(20);
        });
    });

    describe('onFileEdit', () => {
        it('returns files that need incremental re-analysis', () => {
            const affected = enrichment.onFileEdit('src/service.ts');
            expect(affected).toBeDefined();
            expect(affected.filePath).toBe('src/service.ts');
            expect(affected.needsReanalysis).toBe(true);
        });

        it('boosts attention weight higher than read', () => {
            enrichment.onFileRead('src/service.ts', ['fn:service.ts:create']);
            const readWeight = enrichment.getAttentionWeight('fn:service.ts:create');
            enrichment.onFileEdit('src/service.ts');
            enrichment.onFileRead('src/service.ts', ['fn:service.ts:create']);
            const editWeight = enrichment.getAttentionWeight('fn:service.ts:create');
            expect(editWeight).toBeGreaterThan(readWeight);
        });
    });

    describe('getTopAttentionNodes', () => {
        it('returns nodes sorted by attention weight', () => {
            enrichment.onFileRead('src/a.ts', ['fn:a.ts:hot']);
            enrichment.onFileRead('src/a.ts', ['fn:a.ts:hot']);
            enrichment.onFileRead('src/a.ts', ['fn:a.ts:hot']);
            enrichment.onFileRead('src/b.ts', ['fn:b.ts:cold']);
            const top = enrichment.getTopAttentionNodes(5);
            expect(top[0].nodeId).toBe('fn:a.ts:hot');
            expect(top[0].weight).toBeGreaterThan(top[1].weight);
        });
    });
});
