export interface GraphNode {
    id: string;
    type: string;
    name: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    metadata: {
        cluster?: number;
        pagerank?: number;
        centrality?: number;
        violation?: boolean;
    };
    cluster?: number;
}

export interface GraphEdge {
    sourceId: string;
    targetId: string;
    type:
        | 'calls'
        | 'imports'
        | 'contains'
        | 'references'
        | 'imports_symbol'
        | 'extends'
        | 'implements';
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface NodeContext {
    node: GraphNode;
    dependencies: GraphNode[];
    dependents: GraphNode[];
    constraints: IntentEntry[];
    decisions: IntentEntry[];
}

export interface IntentEntry {
    id: string;
    type: 'decision' | 'constraint';
    scope: string;
    status: 'active' | 'proposed' | 'archived';
    author: string;
    createdAt: string;
    content: string;
}

export interface HealthReport {
    score: number;
    categories: {
        constraintViolations: HealthCategory;
        circularDeps: HealthCategory;
        deadCode: HealthCategory;
        coupling: HealthCategory;
    };
}

export interface HealthCategory {
    score: number;
    weight: number;
    issues: HealthIssue[];
}

export interface HealthIssue {
    severity: 'error' | 'warning' | 'info';
    message: string;
    filePath: string;
    line?: number;
    category: string;
}

export interface DnaEntry {
    id: string;
    rule: string;
    reason: string;
    category: string;
    applies_to: string[];
    not_for?: string[];
    source: 'explicit' | 'correction' | 'observed';
    status: 'suggested' | 'approved' | 'rejected';
    confidence: number;
    evidence: {
        first_seen: string;
        last_seen: string;
        occurrences: number;
        sessions: number;
    };
    origin?: {
        file?: string;
        context?: string;
    };
}

export type {
    CortexNode,
    CortexEdge,
    CortexGraphData,
    ToolResponse,
    ExecutionFlow,
    IntelligenceFinding,
} from './cortex-types';
