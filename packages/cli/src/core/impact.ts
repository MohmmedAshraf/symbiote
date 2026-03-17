import type { GraphInstance, RiskLevel } from './types.js';
import { computeRiskLevel } from './types.js';

const EDGE_CONFIDENCE: Record<string, number> = {
    calls: 0.9,
    imports: 0.7,
    imports_symbol: 0.7,
    references: 0.4,
    contains: 0.3,
};

export interface ImpactEntry {
    node: string;
    depth: number;
    path: string[];
    confidence: number;
}

export interface ImpactSummary {
    totalAffected: number;
    criticalPaths: number;
    riskLevel: RiskLevel;
}

export interface ImpactResult {
    depths: Record<number, ImpactEntry[]>;
    summary: ImpactSummary;
}

export class ImpactAnalyzer {
    constructor(private graph: GraphInstance) {}

    getBlastRadius(nodeId: string, maxDepth: number): ImpactResult {
        const depths: Record<number, ImpactEntry[]> = {};
        const bestConfidence = new Map<string, number>();

        if (!this.graph.hasNode(nodeId)) {
            return {
                depths: { 0: [{ node: nodeId, depth: 0, path: [nodeId], confidence: 1.0 }] },
                summary: { totalAffected: 0, criticalPaths: 0, riskLevel: 'LOW' },
            };
        }

        depths[0] = [{ node: nodeId, depth: 0, path: [nodeId], confidence: 1.0 }];
        bestConfidence.set(nodeId, 1.0);

        let currentFrontier: ImpactEntry[] = depths[0];

        for (let depth = 1; depth <= maxDepth; depth++) {
            const nextLevel: ImpactEntry[] = [];

            for (const entry of currentFrontier) {
                if (!this.graph.hasNode(entry.node)) continue;
                const inEdges = this.graph.inEdges(entry.node);

                for (const edgeKey of inEdges) {
                    const source = this.graph.source(edgeKey);
                    const edgeType = this.graph.getEdgeAttribute(edgeKey, 'type') as string;
                    const edgeConf = EDGE_CONFIDENCE[edgeType] ?? 0.5;
                    const compoundConf = entry.confidence * edgeConf;

                    const existing = bestConfidence.get(source) ?? 0;
                    if (compoundConf <= existing) continue;

                    bestConfidence.set(source, compoundConf);
                    nextLevel.push({
                        node: source,
                        depth,
                        path: [...entry.path, source],
                        confidence: compoundConf,
                    });
                }
            }

            if (nextLevel.length > 0) {
                depths[depth] = nextLevel;
            }

            currentFrontier = nextLevel;
        }

        const allEntries = Object.values(depths).flat();
        const affected = allEntries.filter((e) => e.depth > 0);
        const criticalPaths = affected.filter((e) => e.confidence > 0.7).length;
        const maxConf = affected.length > 0 ? Math.max(...affected.map((e) => e.confidence)) : 0;

        return {
            depths,
            summary: {
                totalAffected: affected.length,
                criticalPaths,
                riskLevel: computeRiskLevel(maxConf),
            },
        };
    }
}
