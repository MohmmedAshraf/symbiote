import type { CategoryScore } from './types.js';

const WEIGHT_CONSTRAINTS = 0.4;
const WEIGHT_CIRCULAR = 0.2;
const WEIGHT_DEAD_CODE = 0.2;
const WEIGHT_COUPLING = 0.2;

const PENALTY_PER_CONSTRAINT_VIOLATION = 20;
const PENALTY_PER_CIRCULAR_DEP = 25;
const PENALTY_PER_DEAD_CODE = 5;
const PENALTY_PER_COUPLING_HOTSPOT = 10;

export function computeCategoryScore(
    issueCount: number,
    penaltyPerIssue: number
): number {
    return Math.max(0, 100 - issueCount * penaltyPerIssue);
}

export interface IssueCounts {
    constraintViolations: number;
    circularDeps: number;
    deadCode: number;
    couplingHotspots: number;
}

export interface ScoredResult {
    score: number;
    categories: {
        constraints: CategoryScore;
        circularDeps: CategoryScore;
        deadCode: CategoryScore;
        coupling: CategoryScore;
    };
}

export function computeHealthScore(
    counts: IssueCounts
): ScoredResult {
    const constraintScore = computeCategoryScore(
        counts.constraintViolations,
        PENALTY_PER_CONSTRAINT_VIOLATION
    );
    const circularScore = computeCategoryScore(
        counts.circularDeps,
        PENALTY_PER_CIRCULAR_DEP
    );
    const deadCodeScore = computeCategoryScore(
        counts.deadCode,
        PENALTY_PER_DEAD_CODE
    );
    const couplingScore = computeCategoryScore(
        counts.couplingHotspots,
        PENALTY_PER_COUPLING_HOTSPOT
    );

    const total = Math.round(
        constraintScore * WEIGHT_CONSTRAINTS +
            circularScore * WEIGHT_CIRCULAR +
            deadCodeScore * WEIGHT_DEAD_CODE +
            couplingScore * WEIGHT_COUPLING
    );

    return {
        score: total,
        categories: {
            constraints: {
                score: constraintScore,
                weight: WEIGHT_CONSTRAINTS,
                issueCount: counts.constraintViolations,
            },
            circularDeps: {
                score: circularScore,
                weight: WEIGHT_CIRCULAR,
                issueCount: counts.circularDeps,
            },
            deadCode: {
                score: deadCodeScore,
                weight: WEIGHT_DEAD_CODE,
                issueCount: counts.deadCode,
            },
            coupling: {
                score: couplingScore,
                weight: WEIGHT_COUPLING,
                issueCount: counts.couplingHotspots,
            },
        },
    };
}
