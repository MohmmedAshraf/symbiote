import type { ServerContext } from '../context.js';
import type { NodeRecord } from '../../storage/repository.js';
import type { IntentEntry } from '../../brain/intent.js';
import { semanticSearch } from '../../brain/embeddings.js';

export interface ProjectOverviewOutput {
    totalNodes: number;
    totalEdges: number;
    totalFiles: number;
    nodesByType: Record<string, number>;
    constraints: IntentEntry[];
    decisions: IntentEntry[];
}

export async function handleGetProjectOverview(ctx: ServerContext): Promise<ProjectOverviewOutput> {
    const overview = await ctx.graph.getOverview();
    const constraints = ctx.intent.listEntries('constraint', {
        status: 'active',
    });
    const decisions = ctx.intent.listEntries('decision', {
        status: 'active',
    });

    return {
        totalNodes: overview.totalNodes,
        totalEdges: overview.totalEdges,
        totalFiles: overview.totalFiles,
        nodesByType: overview.nodesByType,
        constraints,
        decisions,
    };
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
): Promise<FileContextOutput> {
    const fileCtx = await ctx.graph.getFileContext(input.filePath);

    const constraints = ctx.intent
        .listEntries('constraint')
        .filter(
            (c) =>
                c.frontmatter.scope === 'global' || input.filePath.startsWith(c.frontmatter.scope),
        );

    const decisions = ctx.intent
        .listEntries('decision')
        .filter(
            (d) =>
                d.frontmatter.scope === 'global' || input.filePath.startsWith(d.frontmatter.scope),
        );

    return {
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
    };
}

export interface QueryGraphInput {
    query: string;
    type: 'search' | 'dependencies' | 'dependents';
}

export interface QueryGraphOutput {
    results: NodeRecord[];
}

export async function handleQueryGraph(
    ctx: ServerContext,
    input: QueryGraphInput,
): Promise<QueryGraphOutput> {
    switch (input.type) {
        case 'search':
            return { results: await ctx.graph.searchNodes(input.query) };
        case 'dependencies':
            return {
                results: await ctx.graph.getDependencies(input.query),
            };
        case 'dependents':
            return {
                results: await ctx.graph.getDependents(input.query),
            };
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
): Promise<SemanticSearchOutput> {
    try {
        const queryVector = new Array(384).fill(0);
        const searchResults = await semanticSearch(ctx.db, queryVector, input.limit ?? 10);

        const results = await Promise.all(
            searchResults.map(async (r) => ({
                node: (await ctx.repo.getNodeById(r.nodeId)) ?? null,
                distance: r.distance,
            })),
        );

        return { results };
    } catch {
        return { results: [] };
    }
}
