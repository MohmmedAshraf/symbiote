import { describe, it, expect } from 'vitest';
import {
    computeHealthScore,
    computeCategoryScore,
} from '../../../src/brain/health/scorer.js';

describe('computeCategoryScore', () => {
    it('returns 100 when there are zero issues', () => {
        expect(computeCategoryScore(0, 20)).toBe(100);
    });

    it('returns 0 when issues exceed the penalty cap', () => {
        expect(computeCategoryScore(10, 20)).toBe(0);
    });

    it('deducts penalty per issue', () => {
        expect(computeCategoryScore(2, 20)).toBe(60);
    });

    it('never goes below 0', () => {
        expect(computeCategoryScore(100, 20)).toBe(0);
    });
});

describe('computeHealthScore', () => {
    it('returns 100 when all categories are perfect', () => {
        const score = computeHealthScore({
            constraintViolations: 0,
            circularDeps: 0,
            deadCode: 0,
            couplingHotspots: 0,
        });
        expect(score.score).toBe(100);
        expect(score.categories.constraints.score).toBe(100);
        expect(score.categories.circularDeps.score).toBe(100);
        expect(score.categories.deadCode.score).toBe(100);
        expect(score.categories.coupling.score).toBe(100);
    });

    it('returns 0 when all categories are maxed out', () => {
        const score = computeHealthScore({
            constraintViolations: 100,
            circularDeps: 100,
            deadCode: 100,
            couplingHotspots: 100,
        });
        expect(score.score).toBe(0);
    });

    it('applies correct weights (40/20/20/20)', () => {
        const score = computeHealthScore({
            constraintViolations: 5,
            circularDeps: 0,
            deadCode: 0,
            couplingHotspots: 0,
        });
        expect(score.categories.constraints.weight).toBe(0.4);
        expect(score.categories.circularDeps.weight).toBe(0.2);
        expect(score.categories.deadCode.weight).toBe(0.2);
        expect(score.categories.coupling.weight).toBe(0.2);

        const constraintScore = computeCategoryScore(5, 20);
        const expected = Math.round(
            constraintScore * 0.4 +
                100 * 0.2 +
                100 * 0.2 +
                100 * 0.2
        );
        expect(score.score).toBe(expected);
    });

    it('handles mixed issue counts correctly', () => {
        const score = computeHealthScore({
            constraintViolations: 2,
            circularDeps: 1,
            deadCode: 5,
            couplingHotspots: 3,
        });
        expect(score.score).toBeGreaterThan(0);
        expect(score.score).toBeLessThan(100);
    });
});
