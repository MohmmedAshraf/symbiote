import type { ServerContext } from '../context.js';
import type { DnaEntry } from '#dna/schema.js';
import type { CaptureInput } from '#dna/engine.js';
import type { ToolResponse } from '#cortex/types.js';
import { wrapResponse } from '../tool-response.js';

export interface GetDeveloperDnaInput {
    category?: string;
    limit?: number;
    verbose?: boolean;
}

interface CompactDnaEntry {
    rule: string;
    category: string;
    confidence: number;
    applies_to: string[];
    not_for?: string[];
}

export interface GetDeveloperDnaOutput {
    entries: CompactDnaEntry[] | DnaEntry[];
    total: number;
    truncated: boolean;
}

export function handleGetDeveloperDna(
    ctx: ServerContext,
    input: GetDeveloperDnaInput,
): ToolResponse<GetDeveloperDnaOutput> {
    let entries = ctx.dnaEngine.getActiveEntries();

    if (input.category) {
        entries = entries.filter((e) => e.category === input.category);
    }

    entries.sort((a, b) => b.confidence - a.confidence);

    const total = entries.length;
    const limit = input.limit ?? 30;
    const truncated = entries.length > limit;
    entries = entries.slice(0, limit);

    if (input.verbose) {
        return wrapResponse({ entries, total, truncated }, 7, false);
    }

    const compact: CompactDnaEntry[] = entries.map((e) => {
        const entry: CompactDnaEntry = {
            rule: e.rule,
            category: e.category,
            confidence: e.confidence,
            applies_to: e.applies_to,
        };
        if (e.not_for?.length) {
            entry.not_for = e.not_for;
        }
        return entry;
    });

    return wrapResponse({ entries: compact, total, truncated }, 7, false);
}

export type RecordInstructionInput = CaptureInput;

export interface RecordInstructionOutput {
    entry: DnaEntry;
}

export function handleRecordInstruction(
    ctx: ServerContext,
    input: RecordInstructionInput,
): ToolResponse<RecordInstructionOutput> {
    const entry = ctx.dnaEngine.captureInstruction(input);

    return wrapResponse({ entry }, 7, false);
}
