import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ImpactAnalyzer } from '#core/impact.js';
import type { ServerContext } from './context.js';
import { handleGetDeveloperDna, handleRecordInstruction } from './tools/dna-tools.js';
import {
    handleGetProjectOverview,
    handleGetContextForFile,
    handleQueryGraph,
    handleSemanticSearch,
    type QueryGraphInput,
} from './tools/project-tools.js';
import { handleGetHealth } from './tools/health-tools.js';
import { handleGetImpact, handleDetectChanges } from './tools/impact-tools.js';
import { registerTraceTools } from './tools/trace-tools.js';
import { handleFindPatterns, handleGetArchitecture } from './tools/architecture-tools.js';
import {
    handleQueryGraphV2,
    handleGetContextForSymbol,
    isLegacyQueryFormat,
} from './tools/graph-tools.js';
import { handleRenameSymbol } from './tools/rename-tool.js';
import {
    handleGetConstraints,
    handleGetDecisions,
    handleProposeConstraint,
    handleProposeDecision,
} from './tools/intent-tools.js';
import {
    handleDnaResource,
    handleProjectOverviewResource,
    handleProjectHealthResource,
} from './resources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function findPackageJson(dir: string): string {
    const candidate = path.join(dir, 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found');
    return findPackageJson(parent);
}

const { version } = require(findPackageJson(__dirname)) as { version: string };

function textResult(data: unknown): { type: 'text'; text: string } {
    return { type: 'text', text: JSON.stringify(data, null, 2) };
}

export function createMcpServer(ctx: ServerContext): { server: McpServer } {
    const server = new McpServer(
        { name: 'symbiote', version },
        {
            instructions: [
                'Symbiote provides code intelligence through graph analysis.',
                'Search for these tools when:',
                '- Before refactoring or renaming: get_impact, rename_symbol',
                '- Understanding unfamiliar code: get_context_for_file, get_context_for_symbol',
                '- Finding code by meaning: semantic_search',
                '- Reviewing changes before commit: detect_changes',
                '- Recording developer corrections: record_instruction',
            ].join('\n'),
        },
    );

    let cachedImpact: ImpactAnalyzer | null = null;
    function getImpactAnalyzer(): ImpactAnalyzer {
        if (!cachedImpact) {
            cachedImpact = new ImpactAnalyzer(ctx.graphology);
        }
        return cachedImpact;
    }

    server.tool(
        'get_developer_dna',
        "Get the developer's coding style and preferences. Call when unsure about conventions.",
        {
            category: z.string().optional().describe('Filter by category'),
        },
        async (input) => ({
            content: [textResult(handleGetDeveloperDna(ctx, input))],
        }),
    );

    server.tool(
        'record_instruction',
        'When the developer corrects your style or preferences, call this so it persists across sessions.',
        {
            rule: z.string().describe('The coding rule or preference'),
            reason: z.string().optional().describe('Why this rule matters'),
            category: z
                .string()
                .optional()
                .describe('Category like formatting, patterns, architecture'),
            applies_to: z
                .array(z.string())
                .optional()
                .describe('Languages/frameworks this applies to'),
            not_for: z.array(z.string()).optional().describe('Languages/frameworks to exclude'),
            source: z
                .enum(['explicit', 'correction', 'observed'])
                .optional()
                .default('explicit')
                .describe('How this rule was captured'),
            sessionId: z.string().optional().describe('Current session identifier'),
            file: z.string().optional().describe('File being worked on when captured'),
            context: z.string().optional().describe('What triggered this instruction'),
        },
        async (input) => {
            const result = handleRecordInstruction(ctx, {
                rule: input.rule,
                reason: input.reason,
                category: input.category,
                applies_to: input.applies_to,
                not_for: input.not_for,
                source: input.source,
                sessionId: input.sessionId ?? `session-${Date.now()}`,
                file: input.file,
                context: input.context,
            });
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'get_project_overview',
        'Get project structure, stats, and active constraints. Use when starting work on an unfamiliar area.',
        {},
        async () => ({
            content: [textResult(await handleGetProjectOverview(ctx))],
        }),
    );

    server.tool(
        'get_context_for_file',
        'Before refactoring a file, call this to see all dependencies and dependents — prevents breaking downstream code.',
        {
            filePath: z.string().describe('The file path to get context for'),
        },
        async (input) => ({
            content: [textResult(await handleGetContextForFile(ctx, input))],
        }),
    );

    server.tool(
        'query_graph',
        'Advanced: raw SQL against the code graph. Prefer get_context_for_file or get_context_for_symbol for common lookups.',
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
        "Find code by meaning, not keywords. Use when looking for functionality but don't know exact names or locations.",
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
        'Get actionable health issues: circular dependencies, dead code, coupling hotspots. Use before major changes.',
        {},
        async () => ({
            content: [textResult(await handleGetHealth(ctx))],
        }),
    );

    server.tool(
        'get_impact',
        'Before changing a shared function or class, see every file affected with confidence scores. Essential for safe refactoring.',
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
        'Map uncommitted git changes to affected modules with risk levels. Use before committing or creating PRs.',
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
        'Detect anti-patterns and complexity hotspots in a scope. Use during code review or when investigating quality.',
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
        'Understand module structure: layers, boundaries, dependency violations. Use when working across module boundaries.',
        {},
        async () => {
            const result = await handleGetArchitecture(ctx.cortexRepo);
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'get_context_for_symbol',
        'Deep dive into a function or class: callers, callees, type relationships. Use before modifying shared code.',
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
        "Safe rename across the codebase — shows every file that needs to change. Returns a preview, doesn't write.",
        {
            symbol: z.string().describe('Symbol name or ID to rename'),
            new_name: z.string().describe('New name for the symbol'),
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

    server.tool(
        'get_constraints',
        'List active architectural rules scoped to a directory or the whole project.',
        {
            scope: z
                .string()
                .optional()
                .describe(
                    'Filter by scope (e.g. file path). Returns global + matching scoped constraints.',
                ),
        },
        async (input) => {
            const result = await handleGetConstraints(ctx, input);
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'get_decisions',
        'List architectural decisions with rationale. Use to understand why something was built a certain way.',
        {
            scope: z
                .string()
                .optional()
                .describe(
                    'Filter by scope (e.g. file path). Returns global + matching scoped decisions.',
                ),
        },
        async (input) => {
            const result = await handleGetDecisions(ctx, input);
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'propose_constraint',
        'Suggest a new architectural rule for developer review.',
        {
            id: z.string().describe('Unique constraint ID (slug format, e.g. "no-raw-sql")'),
            content: z.string().describe('The constraint rule text'),
            scope: z
                .string()
                .optional()
                .default('global')
                .describe('Scope: "global" or a file/dir path'),
        },
        (input) => {
            const result = handleProposeConstraint(ctx, input);
            return { content: [textResult(result)] };
        },
    );

    server.tool(
        'propose_decision',
        'Record an architectural decision with rationale for developer review.',
        {
            id: z
                .string()
                .describe('Unique decision ID (slug format, e.g. "chose-vitest-over-jest")'),
            content: z.string().describe('The decision text with rationale'),
            scope: z
                .string()
                .optional()
                .default('global')
                .describe('Scope: "global" or a file/dir path'),
        },
        (input) => {
            const result = handleProposeDecision(ctx, input);
            return { content: [textResult(result)] };
        },
    );

    return { server };
}
