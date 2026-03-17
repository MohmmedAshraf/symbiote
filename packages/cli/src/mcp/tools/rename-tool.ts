import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CortexRepository } from '../../cortex/repository.js';
import type { ToolResponse } from '../../cortex/types.js';
import { wrapResponse, getMaxDepth } from '../tool-response.js';

export interface RenameToolContext {
    cortexRepo: CortexRepository;
    rootDir: string;
}

export interface RenameSymbolInput {
    symbol: string;
    newName: string;
    scope?: 'file' | 'project';
}

export interface RenameChange {
    file: string;
    line: number;
    oldText: string;
    newText: string;
}

export interface RenameResult {
    changes: RenameChange[];
}

export interface RenameError {
    error: string;
}

export async function handleRenameSymbol(
    ctx: RenameToolContext,
    input: RenameSymbolInput,
): Promise<ToolResponse<RenameResult | RenameError>> {
    const depth = await getMaxDepth(ctx.cortexRepo);
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
    const changes: RenameChange[] = [];

    addDefinitionChange(ctx, symbol, input.newName, changes);
    addCallerChanges(ctx, refs.callers, symbol.name, input.newName, changes);
    addImportChanges(ctx, refs.importers, symbol.name, input.newName, changes);

    return wrapResponse({ changes }, depth, false);
}

function addDefinitionChange(
    ctx: RenameToolContext,
    symbol: { filePath: string; lineStart: number; name: string },
    newName: string,
    changes: RenameChange[],
): void {
    const content = readFileSafe(ctx.rootDir, symbol.filePath);
    if (!content) return;

    const lines = content.split('\n');
    const line = lines[symbol.lineStart - 1];
    if (!line) return;

    const idx = line.indexOf(symbol.name);
    if (idx === -1) return;

    changes.push({
        file: symbol.filePath,
        line: symbol.lineStart,
        oldText: line,
        newText: line.substring(0, idx) + newName + line.substring(idx + symbol.name.length),
    });
}

function addCallerChanges(
    ctx: RenameToolContext,
    callers: Array<{ sourceId: string; line: number | null }>,
    oldName: string,
    newName: string,
    changes: RenameChange[],
): void {
    for (const caller of callers) {
        if (!caller.line) continue;
        const filePath = extractFilePath(caller.sourceId);
        if (!filePath) continue;

        const content = readFileSafe(ctx.rootDir, filePath);
        if (!content) continue;

        const lines = content.split('\n');
        const lineText = lines[caller.line - 1];
        if (!lineText || !lineText.includes(oldName)) continue;

        changes.push({
            file: filePath,
            line: caller.line,
            oldText: lineText,
            newText: lineText.replaceAll(oldName, newName),
        });
    }
}

function addImportChanges(
    ctx: RenameToolContext,
    importers: Array<{
        sourceId: string;
        line: number | null;
        originalName: string | null;
    }>,
    oldName: string,
    newName: string,
    changes: RenameChange[],
): void {
    for (const imp of importers) {
        if (!imp.line) continue;
        const importerName = imp.originalName ?? oldName;
        if (importerName !== oldName) continue;

        const filePath = extractFilePath(imp.sourceId);
        if (!filePath) continue;

        const content = readFileSafe(ctx.rootDir, filePath);
        if (!content) continue;

        const lines = content.split('\n');
        const lineText = lines[imp.line - 1];
        if (!lineText || !lineText.includes(oldName)) continue;

        changes.push({
            file: filePath,
            line: imp.line,
            oldText: lineText,
            newText: lineText.replaceAll(oldName, newName),
        });
    }
}

function extractFilePath(nodeId: string): string | null {
    const prefixes = ['fn:', 'class:', 'method:', 'interface:', 'type:', 'var:', 'file:'];
    for (const prefix of prefixes) {
        if (nodeId.startsWith(prefix)) {
            const rest = nodeId.slice(prefix.length);
            const colonIdx = rest.indexOf(':');
            return colonIdx === -1 ? rest : rest.substring(0, colonIdx);
        }
    }
    return null;
}

function readFileSafe(rootDir: string, filePath: string): string | null {
    try {
        return readFileSync(resolve(rootDir, filePath), 'utf-8');
    } catch {
        return null;
    }
}
