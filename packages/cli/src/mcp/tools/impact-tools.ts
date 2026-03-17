import { ImpactAnalyzer } from '#core/impact.js';
import { GitImpactAnalyzer } from '#core/git-impact.js';
import type { ImpactResult } from '#core/impact.js';
import type { GitImpactResult } from '#core/git-impact.js';
import type { GraphInstance } from '#core/types.js';
import type { CortexRepository } from '#cortex/repository.js';
import type { ToolResponse } from '#cortex/types.js';
import { wrapResponse, getMaxDepth } from '../tool-response.js';

export interface ImpactToolContext {
    graph: GraphInstance;
    impact: ImpactAnalyzer;
    cortexRepo: CortexRepository;
}

export interface GetImpactInput {
    target: string;
    maxDepth?: number;
}

export async function handleGetImpact(
    ctx: ImpactToolContext,
    input: GetImpactInput,
): Promise<ToolResponse<ImpactResult>> {
    const maxDepth = input.maxDepth ?? 3;
    const depth = await getMaxDepth(ctx.cortexRepo);

    if (!ctx.graph.hasNode(input.target)) {
        return wrapResponse(
            {
                depths: {
                    0: [{ node: input.target, depth: 0, path: [input.target], confidence: 1.0 }],
                },
                summary: { totalAffected: 0, criticalPaths: 0, riskLevel: 'LOW' },
            },
            depth,
            false,
        );
    }

    const result = ctx.impact.getBlastRadius(input.target, maxDepth);
    return wrapResponse(result, depth, false);
}

export interface DetectChangesInput {
    cwd?: string;
}

export async function handleDetectChanges(
    ctx: ImpactToolContext,
    input: DetectChangesInput,
): Promise<ToolResponse<GitImpactResult>> {
    const gitImpact = new GitImpactAnalyzer(ctx.graph);
    const result = await gitImpact.analyzeWorkingChanges(input.cwd);
    const depth = await getMaxDepth(ctx.cortexRepo);
    return wrapResponse(result, depth, false);
}
