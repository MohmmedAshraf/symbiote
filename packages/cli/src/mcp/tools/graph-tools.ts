import type { SymbioteDB } from '#storage/db.js';
import type { CortexRepository } from '#cortex/repository.js';
import type { ToolResponse } from '#cortex/types.js';
import { executePgqQuery } from '#cortex/pgq-queries.js';
import { wrapResponse, getMinDepthLevel } from '../tool-response.js';

export interface GraphToolContext {
    db: SymbioteDB;
    cortexRepo: CortexRepository;
}

export interface QueryGraphV2Input {
    query: string;
}

export interface GetContextForSymbolInput {
    symbol: string;
}

export interface SymbolContext {
    symbol: {
        id: string;
        name: string;
        kind: string;
        filePath: string;
        lineStart: number;
        lineEnd: number;
    };
    callers: Array<{ sourceId: string; line: number | null; confidence: number }>;
    callees: Array<{ targetId: string; line: number | null; confidence: number }>;
    importers: Array<{ sourceId: string; kind: string }>;
    extenders: Array<{ sourceId: string }>;
    implementors: Array<{ sourceId: string }>;
}

export function isLegacyQueryFormat(input: Record<string, unknown>): boolean {
    return 'type' in input && typeof input.type === 'string';
}

export async function handleQueryGraphV2(
    ctx: GraphToolContext,
    input: QueryGraphV2Input,
): Promise<ToolResponse<Record<string, unknown>[]>> {
    const rows = await executePgqQuery(ctx.db, input.query);
    const depth = await getMinDepthLevel(ctx.cortexRepo);
    return wrapResponse(rows, depth, false);
}

export async function handleGetContextForSymbol(
    ctx: GraphToolContext,
    input: GetContextForSymbolInput,
): Promise<ToolResponse<SymbolContext | { error: string }>> {
    const depth = await getMinDepthLevel(ctx.cortexRepo);
    const matches = await ctx.cortexRepo.getSymbolByName(input.symbol);

    if (matches.length === 0) {
        const byId = await ctx.cortexRepo.getSymbolById(input.symbol);
        if (!byId) {
            return wrapResponse({ error: `Symbol '${input.symbol}' not found` }, depth, false);
        }
        matches.push(byId);
    }

    const symbol = matches[0];
    const refs = await ctx.cortexRepo.getReferencesForSymbol(symbol.id);
    const callees = await ctx.cortexRepo.getCallsFrom(symbol.id);

    const result: SymbolContext = {
        symbol,
        callers: refs.callers.map((c) => ({
            sourceId: c.sourceId,
            line: c.line,
            confidence: c.confidence,
        })),
        callees: callees.map((c) => ({
            targetId: c.targetId,
            line: c.line,
            confidence: c.confidence,
        })),
        importers: refs.importers.map((i) => ({
            sourceId: i.sourceId,
            kind: i.kind,
        })),
        extenders: refs.extenders.map((e) => ({ sourceId: e.sourceId })),
        implementors: refs.implementors.map((i) => ({ sourceId: i.sourceId })),
    };

    return wrapResponse(result, depth, false);
}
