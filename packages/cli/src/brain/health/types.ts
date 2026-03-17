import type { NodeRecord } from '#storage/repository.js';

export interface ConstraintViolation {
    constraintId: string;
    constraintDescription: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    matchedText: string;
}

export interface DescriptiveConstraint {
    constraintId: string;
    description: string;
    scope: string;
}

export interface CircularDep {
    chain: string[];
    filePaths: string[];
}

export interface DeadCodeEntry {
    node: NodeRecord;
    reason: string;
}

export interface CouplingHotspot {
    filePath: string;
    incomingEdges: number;
    outgoingEdges: number;
    totalEdges: number;
    coupledFiles: string[];
    fanIn: number;
    fanOut: number;
    weightedCount: number;
    kind: 'fan-in' | 'fan-out' | 'both';
}

export interface CategoryScore {
    score: number;
    weight: number;
    issueCount: number;
}

export interface HealthReport {
    score: number;
    categories: {
        constraints: CategoryScore;
        circularDeps: CategoryScore;
        deadCode: CategoryScore;
        coupling: CategoryScore;
    };
    constraintViolations: ConstraintViolation[];
    descriptiveConstraints: DescriptiveConstraint[];
    circularDeps: CircularDep[];
    deadCode: DeadCodeEntry[];
    couplingHotspots: CouplingHotspot[];
    timestamp: string;
}

export interface HealthSnapshot {
    id: number;
    score: number;
    constraintScore: number;
    circularDepScore: number;
    deadCodeScore: number;
    couplingScore: number;
    constraintViolationCount: number;
    circularDepCount: number;
    deadCodeCount: number;
    couplingHotspotCount: number;
    createdAt: string;
}
