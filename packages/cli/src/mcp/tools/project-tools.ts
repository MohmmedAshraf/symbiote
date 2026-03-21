import type { ServerContext } from '../context.js';
import type { NodeRecord } from '#storage/repository.js';
import type { IntentEntry } from '#brain/intent.js';
import type { ToolResponse } from '#cortex/types.js';
import { wrapResponse, getMaxDepth } from '../tool-response.js';

export interface ProjectOverviewOutput {
    overview: string | null;
    totalNodes: number;
    totalEdges: number;
    totalFiles: number;
    nodesByType: Record<string, number>;
    constraints: IntentEntry[];
    decisions: IntentEntry[];
}

export async function handleGetProjectOverview(
    ctx: ServerContext,
): Promise<ToolResponse<ProjectOverviewOutput>> {
    const [stats, overview, constraints, decisions, depth] = await Promise.all([
        ctx.cortexRepo.getStats(),
        ctx.intent.getOverview(),
        ctx.intent.listEntries('constraint', { status: 'active' }),
        ctx.intent.listEntries('decision', { status: 'active' }),
        getMaxDepth(ctx.cortexRepo),
    ]);

    const nodesByType: Record<string, number> = {};
    const nodeKeys = [
        'functions',
        'classes',
        'methods',
        'interfaces',
        'types',
        'variables',
        'modules',
    ] as const;
    for (const key of nodeKeys) {
        if (stats[key] > 0) nodesByType[key] = stats[key];
    }

    const totalNodes =
        stats.functions +
        stats.classes +
        stats.methods +
        stats.interfaces +
        stats.types +
        stats.variables +
        stats.modules;
    const totalEdges =
        stats.calls +
        stats.imports +
        stats.extends +
        stats.implements +
        stats.contains +
        stats.flowsTo +
        stats.reads +
        stats.writes +
        stats.returns;

    return wrapResponse(
        {
            overview,
            totalNodes,
            totalEdges,
            totalFiles: stats.files,
            nodesByType,
            constraints,
            decisions,
        },
        depth,
        false,
    );
}

export interface GetContextForFileInput {
    filePath: string;
}

export interface FileContextOutput {
    filePath: string;
    nodes: NodeRecord[];
    dependencies: Array<{ node: NodeRecord; type: string }>;
    dependents: Array<{ node: NodeRecord; type: string }>;
    constraints: IntentEntry[];
    decisions: IntentEntry[];
}

export async function handleGetContextForFile(
    ctx: ServerContext,
    input: GetContextForFileInput,
): Promise<ToolResponse<FileContextOutput>> {
    const fileCtx = await ctx.graph.getFileContext(input.filePath);

    const allConstraints = await ctx.intent.listEntries('constraint', { status: 'active' });
    const constraints = allConstraints.filter(
        (c) => c.frontmatter.scope === 'global' || input.filePath.startsWith(c.frontmatter.scope),
    );

    const allDecisions = await ctx.intent.listEntries('decision', { status: 'active' });
    const decisions = allDecisions.filter(
        (d) => d.frontmatter.scope === 'global' || input.filePath.startsWith(d.frontmatter.scope),
    );

    const depth = await getMaxDepth(ctx.cortexRepo);

    return wrapResponse(
        {
            filePath: input.filePath,
            nodes: fileCtx.nodes,
            dependencies: fileCtx.dependencies.map((d) => ({
                node: d.node,
                type: d.edge.type,
            })),
            dependents: fileCtx.dependents.map((d) => ({
                node: d.node,
                type: d.edge.type,
            })),
            constraints,
            decisions,
        },
        depth,
        false,
    );
}

export interface QueryGraphInput {
    query: string;
    type: 'search' | 'dependencies' | 'dependents' | 'hubs';
    limit?: number;
}

export interface QueryGraphOutput {
    results: NodeRecord[];
    edgeCounts?: number[];
}

export async function handleQueryGraph(
    ctx: ServerContext,
    input: QueryGraphInput,
): Promise<ToolResponse<QueryGraphOutput>> {
    const depth = await getMaxDepth(ctx.cortexRepo);
    switch (input.type) {
        case 'search': {
            const results = await ctx.search.textSearch(input.query);
            return wrapResponse({ results: results.map((r) => r.node) }, depth, false);
        }
        case 'dependencies':
            return wrapResponse(
                {
                    results: await ctx.graph.getDependencies(input.query),
                },
                depth,
                false,
            );
        case 'dependents':
            return wrapResponse(
                {
                    results: await ctx.graph.getDependents(input.query),
                },
                depth,
                false,
            );
        case 'hubs': {
            const hubs = await ctx.graph.getHubs(input.limit ?? 20);
            return wrapResponse(
                {
                    results: hubs.map((h) => h.node),
                    edgeCounts: hubs.map((h) => h.edgeCount),
                },
                depth,
                false,
            );
        }
    }
}

export interface SemanticSearchInput {
    query: string;
    limit?: number;
}

export interface SemanticSearchOutput {
    results: Array<{ node: NodeRecord | null; distance: number }>;
}

export async function handleSemanticSearch(
    ctx: ServerContext,
    input: SemanticSearchInput,
): Promise<ToolResponse<SemanticSearchOutput>> {
    const limit = input.limit ?? 10;
    const depth = await getMaxDepth(ctx.cortexRepo);
    try {
        const results = await ctx.search.search(input.query, { limit });
        if (results.length > 0) {
            return wrapResponse(
                {
                    results: results.map((r) => ({
                        node: r.node,
                        distance: 1 - r.score,
                    })),
                },
                depth,
                false,
            );
        }
    } catch (err) {
        console.warn(
            '[symbiote] Semantic search failed, falling back to text:',
            err instanceof Error ? err.message : String(err),
        );
    }

    const textResults = await ctx.search.textSearch(input.query, limit);
    return wrapResponse(
        {
            results: textResults.map((r) => ({
                node: r.node,
                distance: 1 - r.score,
            })),
        },
        depth,
        false,
    );
}
