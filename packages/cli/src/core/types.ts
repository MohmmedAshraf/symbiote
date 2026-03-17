import { createRequire } from 'node:module';

const cjsRequire = createRequire(import.meta.url);
const GraphConstructor = cjsRequire('graphology') as new (opts?: {
    multi?: boolean;
    type?: 'directed' | 'undirected' | 'mixed';
}) => GraphInstance;

export interface GraphInstance {
    order: number;
    size: number;
    addNode(id: string, attrs?: Record<string, unknown>): void;
    hasNode(id: string): boolean;
    addEdge(source: string, target: string, attrs?: Record<string, unknown>): void;
    hasEdge(source: string, target: string): boolean;
    getNodeAttribute(id: string, attr: string): unknown;
    getNodeAttributes(id: string): Record<string, unknown>;
    forEachNode(cb: (id: string, attrs: Record<string, unknown>) => void): void;
    forEachEdge(
        cb: (edge: string, attrs: Record<string, unknown>, source: string, target: string) => void,
    ): void;
    forEachOutEdge(
        node: string,
        cb: (edge: string, attrs: Record<string, unknown>, source: string, target: string) => void,
    ): void;
    forEachInEdge(
        node: string,
        cb: (edge: string, attrs: Record<string, unknown>, source: string) => void,
    ): void;
    inEdges(node: string): string[];
    outEdges(node: string): string[];
    source(edge: string): string;
    target(edge: string): string;
    getEdgeAttribute(edge: string, attr: string): unknown;
    filterNodes(predicate: (id: string, attrs: Record<string, unknown>) => boolean): string[];
}

export { GraphConstructor as Graph };

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export function computeRiskLevel(maxConfidence: number): RiskLevel {
    if (maxConfidence > 0.7) return 'HIGH';
    if (maxConfidence > 0.4) return 'MEDIUM';
    return 'LOW';
}
