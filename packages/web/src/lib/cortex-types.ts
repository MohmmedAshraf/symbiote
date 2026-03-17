export type NodeKind =
    | 'function'
    | 'class'
    | 'method'
    | 'interface'
    | 'type'
    | 'variable'
    | 'file'
    | 'module';

export type EdgeKind =
    | 'calls'
    | 'imports'
    | 'extends'
    | 'implements'
    | 'contains'
    | 'flows_to'
    | 'reads'
    | 'writes'
    | 'returns';

export type ArchitecturalLayer =
    | 'controller'
    | 'service'
    | 'repository'
    | 'database'
    | 'utility'
    | 'unknown';

export interface CortexNode {
    id: string;
    kind: NodeKind;
    name: string;
    qualifiedName?: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    isExported: boolean;
    isAsync?: boolean;
    isAbstract?: boolean;
    signature?: string;
    community: number | null;
    pageRank: number | null;
    betweenness: number | null;
    layer?: ArchitecturalLayer;
    isEntryPoint?: boolean;
    entryPointScore?: number;
}

export interface CortexEdge {
    sourceId: string;
    targetId: string;
    kind: EdgeKind;
    confidence: number;
    isAsync?: boolean;
    isDynamic?: boolean;
    taintLabel?: string;
    transform?: string;
}

export interface CortexGraphData {
    nodes: CortexNode[];
    edges: CortexEdge[];
    communityCount: number;
    layers: ArchitecturalLayer[];
    maxDepth: number;
}

export interface LayoutCortexNode extends CortexNode {
    x: number;
    y: number;
    z: number;
    depthBand: 'cortical' | 'subcortical' | 'deep';
}

export interface ExecutionFlow {
    id: string;
    name: string;
    entryPointId: string;
    nodeIds: string[];
    hasAsync: boolean;
    hasErrorPath: boolean;
}

export interface IntelligenceFinding {
    id: string;
    type: 'anti-pattern' | 'violation' | 'hotspot';
    severity: 'error' | 'warning' | 'info';
    title: string;
    description: string;
    nodeIds: string[];
    filePaths: string[];
    category: string;
}

export interface TemporalSnapshot {
    timestamp: string;
    score: number;
    categories: Record<string, number>;
}

export interface CortexHealthReport {
    score: number;
    depth: number;
    deepening: boolean;
    categories: {
        constraintViolations: CortexHealthCategory;
        circularDeps: CortexHealthCategory;
        deadCode: CortexHealthCategory;
        coupling: CortexHealthCategory;
    };
    trends: TemporalSnapshot[];
    findings: IntelligenceFinding[];
}

export interface CortexHealthCategory {
    score: number;
    weight: number;
    issues: CortexHealthIssue[];
    trend: number[];
}

export interface CortexHealthIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
    filePath: string;
    line?: number;
    category: string;
    findingId?: string;
}

export interface ToolResponse<T> {
    data: T;
    depth: number;
    deepening: boolean;
    staleSince?: string;
}

export interface CortexNodeContext {
    node: CortexNode;
    dependencies: CortexNode[];
    dependents: CortexNode[];
    flows: ExecutionFlow[];
    findings: IntelligenceFinding[];
    constraints: Array<{ id: string; content: string; status: string }>;
}
