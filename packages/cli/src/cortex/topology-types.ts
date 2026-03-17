export type LayerKind =
    | 'controller'
    | 'service'
    | 'repository'
    | 'database'
    | 'utility'
    | 'unknown';

export interface TopologyResults {
    communities: Record<string, number>;
    pageRank: Record<string, number>;
    betweenness: Record<string, number>;
    flows: ExecutionFlow[];
    layers: LayerAssignment[];
}

export interface ExecutionFlow {
    id: string;
    name: string;
    entryPointId: string;
    nodeIds: string[];
    hasAsync: boolean;
    hasErrorPath: boolean;
}

export interface LayerAssignment {
    nodeId: string;
    layer: LayerKind;
    confidence: number;
}

export type FindingKind =
    | 'god_class'
    | 'circular_dependency'
    | 'feature_envy'
    | 'shotgun_surgery'
    | 'layer_violation'
    | 'dependency_direction'
    | 'barrel_abuse'
    | 'complexity_hotspot'
    | 'style_deviation'
    | 'decision_contradiction'
    | 'predictive_impact';

export type FindingSeverity = 'info' | 'warning' | 'error';

export interface Finding {
    kind: FindingKind;
    severity: FindingSeverity;
    message: string;
    nodeIds: string[];
    filePaths: string[];
    metadata: Record<string, unknown>;
}

export interface TemporalSnapshot {
    commitHash: string;
    timestamp: Date;
    nodeCounts: Record<string, number>;
    edgeCounts: Record<string, number>;
    communityHash: string;
    topPagerank: Array<{ nodeId: string; score: number }>;
    hotspotRankings: Array<{ nodeId: string; score: number }>;
}

export interface AttentionWeight {
    nodeId: string;
    weight: number;
    lastAccessed: number;
    decayRate: number;
}

export interface InvestigationContext {
    recentFiles: string[];
    inferredScope: string[];
    communityIds: number[];
}

export interface ArchitectureOverview {
    layers: Array<{
        layer: LayerKind;
        nodeCount: number;
        nodeIds: string[];
    }>;
    boundaries: Array<{
        fromLayer: LayerKind;
        toLayer: LayerKind;
        edgeCount: number;
    }>;
    violations: Finding[];
    communityCount: number;
    topHubs: Array<{ nodeId: string; name: string; pageRank: number; betweenness: number }>;
}
