import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CortexRepository } from '../../cortex/repository.js';

interface SymbolInfo {
    id: string;
    name: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    kind: string;
}

interface FlowStep {
    symbolId: string;
    symbol: SymbolInfo | null;
    depth: number;
    edgeType: string;
    isAsync: boolean;
    confidence: number;
}

interface DataFlowStep {
    symbolId: string;
    symbol: SymbolInfo | null;
    depth: number;
    direction: 'forward' | 'backward';
    transform: string | null;
    confidence: number;
}

interface Implementor {
    symbolId: string;
    symbol: SymbolInfo | null;
    confidence: number;
    isIndirect: boolean;
}

async function resolveSymbol(repo: CortexRepository, nameOrId: string): Promise<SymbolInfo | null> {
    const byId = await repo.getSymbolById(nameOrId);
    if (byId) return byId;

    const byName = await repo.getSymbolByName(nameOrId);
    if (byName.length > 0) return byName[0];

    return null;
}

async function traceExecutionFlow(
    repo: CortexRepository,
    entryPoint: string,
    maxDepth: number,
    includeAsync: boolean,
    includeErrors: boolean,
): Promise<FlowStep[]> {
    const resolved = await resolveSymbol(repo, entryPoint);
    if (!resolved) return [];

    const precomputed = await repo.getFlowsByEntryPoint(resolved.id);
    if (precomputed.length > 0) {
        const flow = precomputed[0];
        const steps: FlowStep[] = [];
        for (let i = 0; i < flow.nodeIds.length; i++) {
            const nodeId = flow.nodeIds[i];
            if (nodeId === resolved.id) continue;
            const sym = await repo.getSymbolById(nodeId);
            steps.push({
                symbolId: nodeId,
                symbol: sym,
                depth: i,
                edgeType: 'precomputed_flow',
                isAsync: flow.hasAsync,
                confidence: 1.0,
            });
        }
        return steps;
    }

    const steps: FlowStep[] = [];
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: resolved.id, depth: 0 }];

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id) || depth > maxDepth) continue;
        visited.add(id);

        const calls = await repo.getCallsFrom(id);
        for (const call of calls) {
            if (!includeAsync && call.isAsync) continue;
            const sym = await repo.getSymbolById(call.targetId);
            steps.push({
                symbolId: call.targetId,
                symbol: sym,
                depth: depth + 1,
                edgeType: 'calls',
                isAsync: call.isAsync,
                confidence: call.confidence,
            });
            if (!visited.has(call.targetId) && depth + 1 < maxDepth) {
                queue.push({ id: call.targetId, depth: depth + 1 });
            }
        }

        const flows = await repo.getFlowsFrom(id);
        for (const flow of flows) {
            const sym = await repo.getSymbolById(flow.targetId);
            steps.push({
                symbolId: flow.targetId,
                symbol: sym,
                depth: depth + 1,
                edgeType: 'flows_to',
                isAsync: false,
                confidence: flow.confidence,
            });
            if (!visited.has(flow.targetId) && depth + 1 < maxDepth) {
                queue.push({ id: flow.targetId, depth: depth + 1 });
            }
        }

        if (includeErrors) {
            const returns = await repo.getReturnsFrom(id);
            for (const ret of returns) {
                const sym = await repo.getSymbolById(ret.targetId);
                steps.push({
                    symbolId: ret.targetId,
                    symbol: sym,
                    depth: depth + 1,
                    edgeType: 'returns',
                    isAsync: false,
                    confidence: ret.confidence,
                });
            }
        }
    }

    return steps;
}

async function traceDataFlow(
    repo: CortexRepository,
    symbol: string,
    direction: 'forward' | 'backward',
    maxDepth: number,
): Promise<DataFlowStep[]> {
    const resolved = await resolveSymbol(repo, symbol);
    if (!resolved) return [];

    const steps: DataFlowStep[] = [];
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: resolved.id, depth: 0 }];

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        if (visited.has(id) || depth > maxDepth) continue;
        visited.add(id);

        const edges =
            direction === 'forward' ? await repo.getFlowsFrom(id) : await repo.getFlowsTo(id);

        for (const edge of edges) {
            const nextId = direction === 'forward' ? edge.targetId : edge.sourceId;
            const sym = await repo.getSymbolById(nextId);
            steps.push({
                symbolId: nextId,
                symbol: sym,
                depth: depth + 1,
                direction,
                transform: edge.transform,
                confidence: edge.confidence,
            });
            if (!visited.has(nextId) && depth + 1 < maxDepth) {
                queue.push({ id: nextId, depth: depth + 1 });
            }
        }

        if (direction === 'forward') {
            const reads = await repo.getReadsFrom(id);
            for (const r of reads) {
                const sym = await repo.getSymbolById(r.targetId);
                steps.push({
                    symbolId: r.targetId,
                    symbol: sym,
                    depth: depth + 1,
                    direction,
                    transform: null,
                    confidence: r.confidence,
                });
            }
        } else {
            const writes = await repo.getWritesTo(id);
            for (const w of writes) {
                const sym = await repo.getSymbolById(w.sourceId);
                steps.push({
                    symbolId: w.sourceId,
                    symbol: sym,
                    depth: depth + 1,
                    direction,
                    transform: null,
                    confidence: w.confidence,
                });
            }
        }
    }

    return steps;
}

async function findImplementors(
    repo: CortexRepository,
    interfaceName: string,
    includeIndirect: boolean,
): Promise<Implementor[]> {
    const resolved = await resolveSymbol(repo, interfaceName);
    if (!resolved) return [];

    const directImpls = await repo.getImplementorsOf(resolved.id);
    const results: Implementor[] = [];

    for (const impl of directImpls) {
        const sym = await repo.getSymbolById(impl.sourceId);
        results.push({
            symbolId: impl.sourceId,
            symbol: sym,
            confidence: impl.confidence,
            isIndirect: false,
        });
    }

    if (includeIndirect) {
        const visited = new Set(results.map((r) => r.symbolId));
        const queue = [...results.map((r) => r.symbolId)];

        while (queue.length > 0) {
            const id = queue.shift()!;
            const subImpls = await repo.getImplementorsOf(id);
            for (const sub of subImpls) {
                if (!visited.has(sub.sourceId)) {
                    visited.add(sub.sourceId);
                    const sym = await repo.getSymbolById(sub.sourceId);
                    results.push({
                        symbolId: sub.sourceId,
                        symbol: sym,
                        confidence: sub.confidence * 0.8,
                        isIndirect: true,
                    });
                    queue.push(sub.sourceId);
                }
            }
        }
    }

    return results;
}

function textResult(data: unknown): { type: 'text'; text: string } {
    return { type: 'text', text: JSON.stringify(data, null, 2) };
}

export function registerTraceTools(server: McpServer, repo: CortexRepository): void {
    server.tool(
        'trace_flow',
        'Trace execution flow from an entry point through calls and data flows.',
        {
            entryPoint: z.string().describe('Symbol ID or name to start tracing from'),
            maxDepth: z
                .number()
                .optional()
                .default(5)
                .describe('Maximum traversal depth (default: 5)'),
            includeAsync: z
                .boolean()
                .optional()
                .default(true)
                .describe('Include async call edges (default: true)'),
            includeErrors: z
                .boolean()
                .optional()
                .default(false)
                .describe('Include error/return paths (default: false)'),
        },
        async (input) => ({
            content: [
                textResult(
                    await traceExecutionFlow(
                        repo,
                        input.entryPoint,
                        input.maxDepth,
                        input.includeAsync,
                        input.includeErrors,
                    ),
                ),
            ],
        }),
    );

    server.tool(
        'trace_data',
        'Trace data flow forward or backward from a symbol.',
        {
            symbol: z.string().describe('Symbol ID or name to trace data flow from'),
            direction: z
                .enum(['forward', 'backward'])
                .default('forward')
                .describe('Trace direction: forward or backward'),
            maxDepth: z
                .number()
                .optional()
                .default(5)
                .describe('Maximum traversal depth (default: 5)'),
        },
        async (input) => ({
            content: [
                textResult(
                    await traceDataFlow(repo, input.symbol, input.direction, input.maxDepth),
                ),
            ],
        }),
    );

    server.tool(
        'find_implementations',
        'Find all classes that implement an interface or extend a base class.',
        {
            interfaceName: z.string().describe('Interface or base class name/ID'),
            includeIndirect: z
                .boolean()
                .optional()
                .default(false)
                .describe('Include indirect implementations (default: false)'),
        },
        async (input) => ({
            content: [
                textResult(
                    await findImplementors(repo, input.interfaceName, input.includeIndirect),
                ),
            ],
        }),
    );
}
