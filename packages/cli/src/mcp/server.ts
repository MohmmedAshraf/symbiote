import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServerContext } from './context.js';
import { handleGetDeveloperDna, handleRecordInstruction } from './tools/dna-tools.js';
import {
    handleGetProjectOverview,
    handleGetContextForFile,
    handleQueryGraph,
    handleSemanticSearch,
} from './tools/project-tools.js';
import {
    handleGetConstraints,
    handleGetDecisions,
    handleProposeDecision,
    handleProposeConstraint,
} from './tools/intent-tools.js';
import { handleGetHealth } from './tools/health-tools.js';
import { handleGetImpact, handleDetectChanges } from './tools/impact-tools.js';
import { ImpactAnalyzer } from '../core/impact.js';
import {
    handleDnaResource,
    handleProjectOverviewResource,
    handleProjectHealthResource,
} from './resources.js';

export function createMcpServer(ctx: ServerContext): { server: McpServer } {
    const server = new McpServer({
        name: 'symbiote',
        version: '0.1.0',
    });

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
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(handleGetDeveloperDna(ctx, input), null, 2),
                },
            ],
        }),
    );

    server.tool(
        'get_project_overview',
        "Returns the project's structure, stats, and health summary.",
        {},
        async () => ({
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(await handleGetProjectOverview(ctx), null, 2),
                },
            ],
        }),
    );

    server.tool(
        'get_context_for_file',
        'Returns everything about a specific file: symbols, dependencies, dependents, constraints, decisions.',
        {
            filePath: z.string().describe('The file path to get context for'),
        },
        async (input) => ({
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(await handleGetContextForFile(ctx, input), null, 2),
                },
            ],
        }),
    );

    server.tool(
        'query_graph',
        'Search the code graph: find symbols by name, trace dependencies or dependents.',
        {
            query: z.string().describe('Search query or node ID for dependency/dependent lookup'),
            type: z.enum(['search', 'dependencies', 'dependents']).describe('Query type'),
        },
        async (input) => ({
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(await handleQueryGraph(ctx, input), null, 2),
                },
            ],
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
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(await handleSemanticSearch(ctx, input), null, 2),
                },
            ],
        }),
    );

    server.tool(
        'get_constraints',
        'Returns active constraints, optionally scoped to a file or module.',
        {
            scope: z.string().optional().describe('File path or module to scope constraints to'),
        },
        async (input) => ({
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(handleGetConstraints(ctx, input), null, 2),
                },
            ],
        }),
    );

    server.tool(
        'get_decisions',
        'Returns architectural decisions, optionally scoped to a file or module.',
        {
            scope: z.string().optional().describe('File path or module to scope decisions to'),
        },
        async (input) => ({
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(handleGetDecisions(ctx, input), null, 2),
                },
            ],
        }),
    );

    server.tool(
        'get_health',
        "Returns the project's health report: dead code, circular deps, orphans, violations.",
        {},
        async () => ({
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(await handleGetHealth(ctx), null, 2),
                },
            ],
        }),
    );

    server.tool(
        'propose_decision',
        'Write back an architectural decision as a proposed entry.',
        {
            id: z.string().describe('Unique ID for the decision'),
            content: z.string().describe('The decision description and rationale'),
            scope: z.string().default('global').describe("Scope: 'global' or a file/module path"),
        },
        async (input) => ({
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(handleProposeDecision(ctx, input), null, 2),
                },
            ],
        }),
    );

    server.tool(
        'propose_constraint',
        'Write back a constraint as a proposed entry.',
        {
            id: z.string().describe('Unique ID for the constraint'),
            content: z.string().describe('The constraint rule description'),
            scope: z.string().default('global').describe("Scope: 'global' or a file/module path"),
        },
        async (input) => ({
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(handleProposeConstraint(ctx, input), null, 2),
                },
            ],
        }),
    );

    server.tool(
        'record_instruction',
        'Captures a developer correction or instruction for DNA processing.',
        {
            instruction: z.string().describe("The developer's instruction or correction"),
            sessionId: z.string().describe('Current session identifier'),
            isExplicit: z
                .boolean()
                .default(false)
                .describe('True if the developer explicitly stated a preference'),
        },
        async (input) => ({
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(handleRecordInstruction(ctx, input), null, 2),
                },
            ],
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
            const impact = new ImpactAnalyzer(ctx.graphology);
            const result = handleGetImpact({ graph: ctx.graphology, impact }, input);
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        },
    );

    server.tool(
        'detect_changes',
        'Analyze uncommitted git changes: maps modified files to affected modules with risk assessment.',
        {},
        async () => {
            const impact = new ImpactAnalyzer(ctx.graphology);
            const result = handleDetectChanges({ graph: ctx.graphology, impact }, {});
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
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

    return { server };
}
