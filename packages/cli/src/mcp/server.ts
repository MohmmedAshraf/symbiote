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
    type QueryGraphInput,
} from './tools/project-tools.js';
import { handleGetHealth } from './tools/health-tools.js';
import { handleGetImpact, handleDetectChanges } from './tools/impact-tools.js';
import { ImpactAnalyzer } from '../core/impact.js';
import { registerTraceTools } from './tools/trace-tools.js';
import { handleFindPatterns, handleGetArchitecture } from './tools/architecture-tools.js';
import {
    handleQueryGraphV2,
    handleGetContextForSymbol,
    isLegacyQueryFormat,
} from './tools/graph-tools.js';
import { handleRenameSymbol } from './tools/rename-tool.js';
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
        'Query the code graph using SQL/PGQ or plain SQL. Accepts any read-only SELECT query against cortex tables and the code_graph property graph.',
        {
            query: z.string().describe('SQL or SQL/PGQ query (read-only SELECT only)'),
            type: z
                .enum(['search', 'dependencies', 'dependents', 'hubs'])
                .optional()
                .describe('[DEPRECATED] Legacy query type — use SQL query instead'),
            limit: z
                .number()
                .optional()
                .default(20)
                .describe('[DEPRECATED] Legacy limit — use SQL LIMIT instead'),
        },
        async (input) => {
            if (isLegacyQueryFormat(input)) {
                console.warn(
                    '[symbiote] DEPRECATED: query_graph legacy format (type/limit) is deprecated. Use SQL/PGQ query string instead.',
                );
                const result = await handleQueryGraph(ctx, input as QueryGraphInput);
                return { content: [textResult(result)] };
            }
            const result = await handleQueryGraphV2(
                { db: ctx.db, cortexRepo: ctx.cortexRepo },
                { query: input.query },
            );
            return { content: [textResult(result)] };
        },
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
            const result = await handleGetImpact(
                { graph: ctx.graphology, impact: getImpactAnalyzer(), cortexRepo: ctx.cortexRepo },
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
                { graph: ctx.graphology, impact: getImpactAnalyzer(), cortexRepo: ctx.cortexRepo },
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

    registerTraceTools(server, ctx.cortexRepo);

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
            const result = await handleFindPatterns(ctx.cortexRepo, input);
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'get_architecture',
        'Get detected architectural layers, boundaries, dependency direction, and violation summary',
        {},
        async () => {
            const result = await handleGetArchitecture(ctx.cortexRepo);
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'get_context_for_symbol',
        'Deep dive into one function, class, or method: callers, callees, type relationships, import references.',
        {
            symbol: z
                .string()
                .describe(
                    'Symbol name or ID (e.g., "validateEmail" or "fn:utils.ts:validateEmail")',
                ),
        },
        async (input) => {
            const result = await handleGetContextForSymbol(
                { db: ctx.db, cortexRepo: ctx.cortexRepo },
                input,
            );
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'rename_symbol',
        'Graph-aware multi-file rename preview. Returns a diff — does NOT write to disk.',
        {
            symbol: z.string().describe('Symbol name or ID to rename'),
            new_name: z.string().describe('New name for the symbol'),
            scope: z
                .enum(['file', 'project'])
                .optional()
                .default('project')
                .describe('Scope of rename: file or project (default: project)'),
        },
        async (input) => {
            const { new_name: newName, ...rest } = input;
            const result = await handleRenameSymbol(
                { cortexRepo: ctx.cortexRepo, rootDir: ctx.rootDir },
                { ...rest, newName },
            );
            return { content: [textResult(result)] };
        },
    );

    return { server };
}
