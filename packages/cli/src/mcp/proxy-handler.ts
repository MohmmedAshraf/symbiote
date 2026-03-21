import type { IncomingMessage, ServerResponse } from 'node:http';
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
import { traceExecutionFlow, traceDataFlow, findImplementors } from './tools/trace-tools.js';
import { ImpactAnalyzer } from '#core/impact.js';

let cachedImpact: ImpactAnalyzer | null = null;

function getImpactAnalyzer(ctx: ServerContext): ImpactAnalyzer {
    if (!cachedImpact) {
        cachedImpact = new ImpactAnalyzer(ctx.graphology);
    }
    return cachedImpact;
}

async function dispatch(
    ctx: ServerContext,
    tool: string,
    input: Record<string, unknown>,
): Promise<unknown> {
    switch (tool) {
        case 'get_developer_dna':
            return handleGetDeveloperDna(ctx, input);
        case 'record_instruction': {
            return handleRecordInstruction(ctx, {
                rule: (input.rule as string) ?? (input.instruction as string),
                reason: input.reason as string | undefined,
                category: input.category as string | undefined,
                applies_to: input.applies_to as string[] | undefined,
                not_for: input.not_for as string[] | undefined,
                source: (input.source as 'explicit' | 'correction' | 'observed') ?? 'explicit',
                sessionId: (input.sessionId as string) || `session-${Date.now()}`,
                file: input.file as string | undefined,
                context: input.context as string | undefined,
            });
        }
        case 'get_project_overview':
            return handleGetProjectOverview(ctx);
        case 'get_context_for_file':
            return handleGetContextForFile(ctx, input as { filePath: string });
        case 'query_graph': {
            if (isLegacyQueryFormat(input)) {
                return handleQueryGraph(ctx, input as unknown as QueryGraphInput);
            }
            return handleQueryGraphV2(
                { db: ctx.db, cortexRepo: ctx.cortexRepo },
                { query: input.query as string },
            );
        }
        case 'semantic_search':
            return handleSemanticSearch(ctx, input as { query: string; limit?: number });
        case 'get_health':
            return handleGetHealth(ctx);
        case 'get_impact':
            return handleGetImpact(
                {
                    graph: ctx.graphology,
                    impact: getImpactAnalyzer(ctx),
                    cortexRepo: ctx.cortexRepo,
                },
                input as { target: string; maxDepth?: number },
            );
        case 'detect_changes':
            return handleDetectChanges(
                {
                    graph: ctx.graphology,
                    impact: getImpactAnalyzer(ctx),
                    cortexRepo: ctx.cortexRepo,
                },
                {},
            );
        case 'find_patterns':
            return handleFindPatterns(ctx.cortexRepo, input as { scope: string });
        case 'get_architecture':
            return handleGetArchitecture(ctx.cortexRepo);
        case 'get_context_for_symbol':
            return handleGetContextForSymbol(
                { db: ctx.db, cortexRepo: ctx.cortexRepo },
                input as { symbol: string },
            );
        case 'rename_symbol': {
            const symbol = input.symbol as string;
            const newName = input.new_name as string;
            const scope = (input.scope as 'file' | 'project') ?? 'project';
            return handleRenameSymbol(
                { cortexRepo: ctx.cortexRepo, rootDir: ctx.rootDir },
                { symbol, newName, scope },
            );
        }
        case 'get_constraints':
            return handleGetConstraints(ctx, input);
        case 'get_decisions':
            return handleGetDecisions(ctx, input);
        case 'propose_constraint':
            return handleProposeConstraint(ctx, {
                id: input.id as string,
                content: input.content as string,
                scope: (input.scope as string) ?? 'global',
            });
        case 'propose_decision':
            return handleProposeDecision(ctx, {
                id: input.id as string,
                content: input.content as string,
                scope: (input.scope as string) ?? 'global',
            });
        case 'trace_flow': {
            const i = input as {
                entryPoint: string;
                maxDepth?: number;
                includeAsync?: boolean;
                includeErrors?: boolean;
            };
            return traceExecutionFlow(
                ctx.cortexRepo,
                i.entryPoint,
                i.maxDepth ?? 5,
                i.includeAsync ?? true,
                i.includeErrors ?? false,
            );
        }
        case 'trace_data': {
            const i = input as {
                symbol: string;
                direction?: 'forward' | 'backward';
                maxDepth?: number;
            };
            return traceDataFlow(
                ctx.cortexRepo,
                i.symbol,
                i.direction ?? 'forward',
                i.maxDepth ?? 5,
            );
        }
        case 'find_implementations': {
            const i = input as { interfaceName: string; includeIndirect?: boolean };
            return findImplementors(ctx.cortexRepo, i.interfaceName, i.includeIndirect ?? false);
        }
        case 'resource:dna':
            return { text: handleDnaResource(ctx) };
        case 'resource:project-overview':
            return { text: await handleProjectOverviewResource(ctx) };
        case 'resource:project-health':
            return { text: await handleProjectHealthResource(ctx) };
        default:
            return { error: `Unknown tool: ${tool}` };
    }
}

export async function handleMcpProxy(
    ctx: ServerContext,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    let body = '';
    for await (const chunk of req) {
        body += chunk;
        if (body.length > 1024 * 1024) {
            res.writeHead(413);
            res.end('Payload too large');
            return;
        }
    }

    try {
        const { tool, input } = JSON.parse(body) as {
            tool: string;
            input: Record<string, unknown>;
        };
        const result = await dispatch(ctx, tool, input ?? {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
    }
}
