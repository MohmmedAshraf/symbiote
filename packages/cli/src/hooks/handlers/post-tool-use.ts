import path from 'node:path';
import type { PostToolUsePayload, HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { AttentionSet } from '#hooks/attention.js';
import type { GraphInstance } from '#core/types.js';
import type { ParseResult } from '#core/parser.js';
import { EventBus } from '#events/bus.js';
import { createEvent } from '#events/types.js';

type SymbolSnapshot = { name: string; kind: string; lineStart: number; lineEnd: number };

export interface PostToolUseHandlerConfig {
    projectRoot: string;
    onReindexFile: (relativePath: string) => Promise<void>;
    onFullRescan: () => Promise<void>;
    sessionStore: SessionStore;
    attention: AttentionSet;
    eventBus: EventBus;
    graph: GraphInstance;
    sessionId: string;
    preEditSymbols?: Map<string, SymbolSnapshot[]>;
    parseFileFn?: (filePath: string) => ParseResult | null;
}

const FILE_READ_TOOLS = new Set(['Read']);
const FILE_WRITE_TOOLS = new Set(['Edit', 'Write']);

function toRelative(projectRoot: string, filePath: string): string {
    return path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath;
}

function collectSymbolIds(graph: GraphInstance, fileNodeId: string): string[] {
    if (!graph.hasNode(fileNodeId)) {
        return [];
    }
    const symbols: string[] = [];
    graph.forEachOutEdge(
        fileNodeId,
        (_edge: string, attrs: Record<string, unknown>, _source: string, target: string) => {
            if (attrs.type === 'contains') {
                symbols.push(target);
            }
        },
    );
    return symbols;
}

export class PostToolUseHandler {
    private config: PostToolUseHandlerConfig;

    constructor(config: PostToolUseHandlerConfig) {
        this.config = config;
    }

    async handle(payload: PostToolUsePayload): Promise<HttpHookResponse> {
        try {
            return await this.processPayload(payload);
        } catch {
            return {};
        }
    }

    private async processPayload(payload: PostToolUsePayload): Promise<HttpHookResponse> {
        const { tool_name, tool_input } = payload;

        if (FILE_WRITE_TOOLS.has(tool_name)) {
            const rawPath =
                typeof tool_input.file_path === 'string' ? tool_input.file_path : undefined;
            if (rawPath) {
                const relativePath = toRelative(this.config.projectRoot, rawPath);
                await this.config.onReindexFile(relativePath);
                this.config.attention.touchFile(relativePath, 'edit');

                const symbolIds = collectSymbolIds(this.config.graph, `file:${relativePath}`);
                for (const symId of symbolIds) {
                    this.config.attention.touchSymbol(symId, 'edit');
                }

                const eventType = tool_name === 'Write' ? 'file:create' : 'file:edit';
                this.config.eventBus.emit(createEvent(eventType, { filePath: relativePath }));

                await this.config.sessionStore.recordObservation({
                    sessionId: this.config.sessionId,
                    timestamp: Date.now(),
                    toolName: tool_name,
                    event: eventType,
                    filePath: relativePath,
                    symbolsAffected: symbolIds,
                });

                const feedback = this.buildSymbolDiffFeedback(relativePath);
                if (feedback) {
                    return {
                        hookSpecificOutput: {
                            hookEventName: 'PostToolUse',
                            additionalContext: feedback,
                        },
                    };
                }
            }
            return {};
        }

        if (FILE_READ_TOOLS.has(tool_name)) {
            const rawPath =
                typeof tool_input.file_path === 'string' ? tool_input.file_path : undefined;
            if (rawPath) {
                const relativePath = toRelative(this.config.projectRoot, rawPath);
                this.config.attention.touchFile(relativePath);
                this.config.eventBus.emit(createEvent('file:read', { filePath: relativePath }));

                await this.config.sessionStore.recordObservation({
                    sessionId: this.config.sessionId,
                    timestamp: Date.now(),
                    toolName: tool_name,
                    event: 'file:read',
                    filePath: relativePath,
                });
            }
            return {};
        }

        if (tool_name === 'Bash') {
            const command = typeof tool_input.command === 'string' ? tool_input.command : undefined;
            if (command && /git\s+commit/.test(command)) {
                await this.config.onFullRescan();
            }

            await this.config.sessionStore.recordObservation({
                sessionId: this.config.sessionId,
                timestamp: Date.now(),
                toolName: tool_name,
                event: 'tool:use',
            });
            return {};
        }

        await this.config.sessionStore.recordObservation({
            sessionId: this.config.sessionId,
            timestamp: Date.now(),
            toolName: tool_name,
            event: 'tool:use',
        });
        return {};
    }

    private buildSymbolDiffFeedback(relativePath: string): string | null {
        const preSymbols = this.config.preEditSymbols?.get(relativePath);
        this.config.preEditSymbols?.delete(relativePath);
        if (!preSymbols || !this.config.parseFileFn) return null;

        try {
            const absolutePath = path.join(this.config.projectRoot, relativePath);
            const parsed = this.config.parseFileFn(absolutePath);
            if (!parsed) return null;

            const newSymbols = parsed.nodes
                .filter((n) => n.type !== 'file')
                .map((n) => ({
                    name: n.name,
                    kind: n.type,
                    lineStart: n.lineStart,
                    lineEnd: n.lineEnd,
                }));

            return buildSymbolDiff(preSymbols, newSymbols, relativePath);
        } catch {
            return null;
        }
    }
}

function buildSymbolDiff(
    oldSymbols: SymbolSnapshot[],
    newSymbols: SymbolSnapshot[],
    filePath: string,
): string | null {
    const oldMap = new Map(oldSymbols.map((s) => [`${s.name}:${s.kind}`, s]));
    const newMap = new Map(newSymbols.map((s) => [`${s.name}:${s.kind}`, s]));

    const added = newSymbols.filter((s) => !oldMap.has(`${s.name}:${s.kind}`));
    const removed = oldSymbols.filter((s) => !newMap.has(`${s.name}:${s.kind}`));
    const modified = newSymbols.filter((s) => {
        const old = oldMap.get(`${s.name}:${s.kind}`);
        return old && (old.lineStart !== s.lineStart || old.lineEnd !== s.lineEnd);
    });

    if (added.length === 0 && removed.length === 0 && modified.length === 0) {
        return null;
    }

    const lines: string[] = [`Symbol changes in ${path.basename(filePath)}:`];
    for (const s of modified) {
        const old = oldMap.get(`${s.name}:${s.kind}`)!;
        lines.push(
            `  Modified: ${s.name} (was lines ${old.lineStart}-${old.lineEnd}, now ${s.lineStart}-${s.lineEnd})`,
        );
    }
    for (const s of added) {
        lines.push(`  Added: ${s.name} (${s.kind}, lines ${s.lineStart}-${s.lineEnd})`);
    }
    for (const s of removed) {
        lines.push(`  Removed: ${s.name} (${s.kind})`);
    }

    return lines.join('\n');
}
