import { createRequire } from 'node:module';
import { ImpactAnalyzer } from '../../core/impact.js';
import type { ImpactResult } from '../../core/impact.js';

const require = createRequire(import.meta.url);
const Graph = require('graphology');

type GraphInstance = InstanceType<typeof Graph>;

export interface ImpactToolContext {
    graph: GraphInstance;
    impact: ImpactAnalyzer;
}

export interface GetImpactInput {
    target: string;
    maxDepth?: number;
}

export function handleGetImpact(ctx: ImpactToolContext, input: GetImpactInput): ImpactResult {
    const maxDepth = input.maxDepth ?? 3;

    if (!ctx.graph.hasNode(input.target)) {
        return {
            depths: {
                0: [{ node: input.target, depth: 0, path: [input.target], confidence: 1.0 }],
            },
            summary: { totalAffected: 0, criticalPaths: 0, riskLevel: 'LOW' },
        };
    }

    return ctx.impact.getBlastRadius(input.target, maxDepth);
}
