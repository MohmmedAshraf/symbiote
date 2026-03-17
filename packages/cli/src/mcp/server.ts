import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from './context.js';
import { handleGetDeveloperDna } from './tools/dna-tools.js';
import {
    handleGetProjectOverview,
    handleGetContextForFile,
    handleQueryGraph,
    handleSemanticSearch,
} from './tools/project-tools.js';
import { handleGetHealth } from './tools/health-tools.js';
import { handleGetImpact, handleDetectChanges } from './tools/impact-tools.js';
import { ImpactAnalyzer } from '../core/impact.js';
import { registerTraceTools } from './tools/trace-tools.js';
import { handleFindPatterns, handleGetArchitecture } from './tools/architecture-tools.js';
import { CortexRepository } from '../cortex/repository.js';
import {
    handleDnaResource,
    handleProjectOverviewResource,
    handleProjectHealthResource,
} from './resources.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

function textResult(data: unknown): { type: 'text'; text: string } {
    return { type: 'text', text: JSON.stringify(data, null, 2) };
}

export function createMcpServer(ctx: ServerContext): { server: McpServer } {
    const server = new McpServer({
        name: 'symbiote',
        version,
    });

    let cachedImpact: ImpactAnalyzer | null = null;
    function getImpactAnalyzer(): ImpactAnalyzer {
        if (!cachedImpact) {
            cachedImpact = new ImpactAnalyzer(ctx.graphology);
        }
        return cachedImpact;
    }

    server.tool(
        'get_developer_dna',
        "Returns the developer's coding style, preferences, and anti-patterns.",
        {
            category: z
                .string()
                .optional()
                .describe('Filter by category: style, preferences, anti-patterns, decisions'),
            taskContext: z
                .string()
                .optional()
                .describe('Description of the current task for relevance filtering'),
        },
        async (input) => ({
            content: [textResult(handleGetDeveloperDna(ctx, input))],
        }),
    );

    server.tool(
        'get_project_overview',
        "Returns the project's structure, stats, and health summary.",
        {},
        async () => ({
            content: [textResult(await handleGetProjectOverview(ctx))],
        }),
    );

    server.tool(
        'get_context_for_file',
        'Returns everything about a specific file: symbols, dependencies, dependents, constraints, decisions.',
        {
            filePath: z.string().describe('The file path to get context for'),
        },
        async (input) => ({
            content: [textResult(await handleGetContextForFile(ctx, input))],
        }),
    );

    server.tool(
        'query_graph',
        'Search the code graph: find symbols by name, trace dependencies/dependents, or find the most connected hub nodes.',
        {
            query: z
                .string()
                .default('')
                .describe(
                    'Search query or node ID (required for search/dependencies/dependents, ignored for hubs)',
                ),
            type: z
                .enum(['search', 'dependencies', 'dependents', 'hubs'])
                .describe(
                    'Query type: search, dependencies, dependents, or hubs (most connected nodes)',
                ),
            limit: z
                .number()
                .optional()
                .default(20)
                .describe('Max results for hubs query (default: 20)'),
        },
        async (input) => ({
            content: [textResult(await handleQueryGraph(ctx, input))],
        }),
    );

    server.tool(
        'semantic_search',
        'Natural language search over the codebase using vector embeddings.',
        {
            query: z.string().describe("Natural language description of what you're looking for"),
            limit: z.number().optional().default(10).describe('Maximum number of results'),
        },
        async (input) => ({
            content: [textResult(await handleSemanticSearch(ctx, input))],
        }),
    );

    server.tool(
        'get_health',
        "Returns the project's health report: dead code, circular deps, orphans, violations.",
        {},
        async () => ({
            content: [textResult(await handleGetHealth(ctx))],
        }),
    );

    server.tool(
        'get_impact',
        'Analyze blast radius: what breaks if a given symbol changes. Returns affected nodes grouped by depth with confidence scores.',
        {
            target: z
                .string()
                .describe('Node ID of the symbol to analyze (e.g., fn:auth.ts:login)'),
            maxDepth: z
                .number()
                .optional()
                .default(3)
                .describe('Maximum traversal depth (default: 3)'),
        },
        async (input) => {
            const result = handleGetImpact(
                { graph: ctx.graphology, impact: getImpactAnalyzer() },
                input,
            );
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'detect_changes',
        'Analyze uncommitted git changes: maps modified files to affected modules with risk assessment.',
        {},
        async () => {
            const result = await handleDetectChanges(
                { graph: ctx.graphology, impact: getImpactAnalyzer() },
                {},
            );
            return { content: [textResult(result)] };
        },
    );

    server.resource(
        'dna',
        'symbiote://dna',
        {
            description: 'Developer DNA summary — coding style, preferences, and anti-patterns',
        },
        async () => ({
            contents: [
                {
                    uri: 'symbiote://dna',
                    text: handleDnaResource(ctx),
                    mimeType: 'text/plain',
                },
            ],
        }),
    );

    server.resource(
        'project-overview',
        'symbiote://project/overview',
        {
            description: 'Project summary: structure, stats, active constraints and decisions',
        },
        async () => ({
            contents: [
                {
                    uri: 'symbiote://project/overview',
                    text: await handleProjectOverviewResource(ctx),
                    mimeType: 'text/plain',
                },
            ],
        }),
    );

    server.resource(
        'project-health',
        'symbiote://project/health',
        {
            description: 'Current project health: violations, warnings, and score',
        },
        async () => ({
            contents: [
                {
                    uri: 'symbiote://project/health',
                    text: await handleProjectHealthResource(ctx),
                    mimeType: 'text/plain',
                },
            ],
        }),
    );

    const cortexRepo = new CortexRepository(ctx.db);
    registerTraceTools(server, cortexRepo);

    server.tool(
        'find_patterns',
        'Detect anti-patterns, architectural violations, and complexity hotspots within a scope',
        {
            scope: z.string().describe('Scope to search: file path, directory, or "all"'),
            kinds: z
                .array(
                    z.enum([
                        'god_class',
                        'circular_dependency',
                        'feature_envy',
                        'shotgun_surgery',
                        'layer_violation',
                        'dependency_direction',
                        'barrel_abuse',
                        'complexity_hotspot',
                        'style_deviation',
                        'decision_contradiction',
                        'predictive_impact',
                    ]),
                )
                .optional()
                .describe('Filter by specific finding kinds'),
            severity: z
                .enum(['info', 'warning', 'error'])
                .optional()
                .describe('Minimum severity to include'),
        },
        async (input) => {
            const result = await handleFindPatterns(cortexRepo, input);
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'get_architecture',
        'Get detected architectural layers, boundaries, dependency direction, and violation summary',
        {},
        async () => {
            const result = await handleGetArchitecture(cortexRepo);
            return { content: [textResult(result)] };
        },
    );

    return { server };
}
