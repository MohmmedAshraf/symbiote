export interface LobeMetrics {
    community: number;
    readCoverage: number;
    editIntensity: number;
}

export interface BrainMetrics {
    awareness: {
        value: number;
        readNodes: number;
        totalNodes: number;
        blindSpots: number;
    };
    lobes: LobeMetrics[];
    pulse: {
        value: number;
        riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    };
    ripples: {
        totalAffected: number;
        criticalPaths: number;
    };
    events: {
        total: number;
        reads: number;
        edits: number;
        creates: number;
        discoveries: number;
    };
}

export const DEFAULT_BRAIN_METRICS: BrainMetrics = {
    awareness: { value: 0, readNodes: 0, totalNodes: 0, blindSpots: 0 },
    lobes: [],
    pulse: { value: 0, riskLevel: 'LOW' },
    ripples: { totalAffected: 0, criticalPaths: 0 },
    events: { total: 0, reads: 0, edits: 0, creates: 0, discoveries: 0 },
};
