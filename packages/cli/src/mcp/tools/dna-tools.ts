import type { ServerContext } from '../context.js';
import type { DnaEntry, DnaCategory } from '#dna/types.js';
import { DNA_CATEGORIES } from '#dna/types.js';
import type { ToolResponse } from '#cortex/types.js';
import { wrapResponse } from '../tool-response.js';

export interface GetDeveloperDnaInput {
    category?: string;
    taskContext?: string;
}

export interface GetDeveloperDnaOutput {
    entries: DnaEntry[];
}

export function handleGetDeveloperDna(
    ctx: ServerContext,
    input: GetDeveloperDnaInput,
): ToolResponse<GetDeveloperDnaOutput> {
    let entries = ctx.dnaEngine.getActiveEntries();

    if (input.category) {
        entries = entries.filter((e) => e.frontmatter.category === input.category);
    }

    entries.sort((a, b) => b.frontmatter.confidence - a.frontmatter.confidence);

    return wrapResponse({ entries }, 7, false);
}

export interface RecordInstructionInput {
    instruction: string;
    sessionId: string;
    isExplicit: boolean;
    category?: string;
}

export interface RecordInstructionOutput {
    entry: DnaEntry;
}

export function handleRecordInstruction(
    ctx: ServerContext,
    input: RecordInstructionInput,
): ToolResponse<RecordInstructionOutput> {
    const source = input.isExplicit ? 'explicit' : 'correction';
    const validCategory =
        input.category && (DNA_CATEGORIES as readonly string[]).includes(input.category)
            ? (input.category as DnaCategory)
            : undefined;
    const entry = ctx.dnaEngine.captureInstruction(
        input.instruction,
        input.sessionId,
        source,
        validCategory,
    );

    return wrapResponse({ entry }, 7, false);
}
