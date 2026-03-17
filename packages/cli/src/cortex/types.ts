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

export type ImportKind = 'named' | 'default' | 'namespace' | 're_export' | 'dynamic';

export interface FileNode {
    id: string;
    path: string;
    hash: string | null;
    language: string | null;
    depthLevel: number;
    lastIndexed: Date | null;
}

export interface FunctionNode {
    id: string;
    name: string;
    qualifiedName: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    isAsync: boolean;
    isExported: boolean;
    isEntryPoint: boolean;
    entryPointScore: number;
    signature: string | null;
    community: number | null;
    pageRank: number | null;
    betweenness: number | null;
}

export interface ClassNode {
    id: string;
    name: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    isAbstract: boolean;
    isExported: boolean;
    community: number | null;
    pageRank: number | null;
    betweenness: number | null;
}

export interface MethodNode {
    id: string;
    name: string;
    className: string;
    qualifiedName: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    visibility: string;
    isStatic: boolean;
    isAsync: boolean;
    community: number | null;
    pageRank: number | null;
    betweenness: number | null;
}

export interface InterfaceNode {
    id: string;
    name: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    isExported: boolean;
}

export interface TypeNode {
    id: string;
    name: string;
    kind: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    isExported: boolean;
}

export interface VariableNode {
    id: string;
    name: string;
    scope: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    isExported: boolean;
    inferredType: string | null;
}

export interface ToolResponse<T> {
    data: T;
    depth: number;
    deepening: boolean;
    staleSince?: string;
}

export interface ModuleNode {
    id: string;
    path: string;
    isBarrel: boolean;
}

export type SymbolNode =
    | FunctionNode
    | ClassNode
    | MethodNode
    | InterfaceNode
    | TypeNode
    | VariableNode;

export interface CallsEdge {
    sourceId: string;
    targetId: string;
    line: number | null;
    confidence: number;
    isDynamic: boolean;
    isAsync: boolean;
    isIndirect: boolean;
    stage: number;
    reason: string | null;
}

export interface ImportsEdge {
    sourceId: string;
    targetId: string;
    line: number | null;
    kind: ImportKind;
    originalName: string | null;
    alias: string | null;
    confidence: number;
    stage: number;
    reason: string | null;
}

export interface ExtendsEdge {
    sourceId: string;
    targetId: string;
    line: number | null;
    confidence: number;
    stage: number;
    reason: string | null;
}

export interface ImplementsEdge {
    sourceId: string;
    targetId: string;
    line: number | null;
    confidence: number;
    stage: number;
    reason: string | null;
}

export interface ContainsEdge {
    sourceId: string;
    targetId: string;
    confidence: number;
    stage: number;
    reason: string | null;
}

export type CortexEdge = CallsEdge | ImportsEdge | ExtendsEdge | ImplementsEdge | ContainsEdge;

export interface StageResult {
    stage: number;
    filesProcessed: number;
    nodesCreated: number;
    edgesCreated: number;
    durationMs: number;
    errors: StageError[];
}

export interface StageError {
    filePath: string;
    stage: number;
    message: string;
}

export interface PipelineResult {
    stages: StageResult[];
    totalFiles: number;
    totalNodes: number;
    totalEdges: number;
    totalDurationMs: number;
    maxDepth: number;
}

export interface PipelineOptions {
    rootDir: string;
    force?: boolean;
    maxStage?: number;
    targetFiles?: string[];
}

export interface SymbolTableEntry {
    localName: string;
    originalName: string;
    sourcePath: string;
    resolvedSourcePath: string;
    kind: ImportKind;
}

export type SymbolTable = Map<string, SymbolTableEntry>;
