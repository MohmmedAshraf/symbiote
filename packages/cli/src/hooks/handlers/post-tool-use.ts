import path from 'node:path';
import type { PostToolUsePayload, HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { AttentionSet } from '#hooks/attention.js';
import type { GraphInstance } from '#core/types.js';
import type { ParseResult } from '#core/parser.js';
import type { DnaEntry } from '#dna/types.js';
import { EventBus } from '#events/bus.js';
import { createEvent } from '#events/types.js';
import { checkDnaViolations } from '#hooks/dna-checker.js';

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
    dnaEntries?: DnaEntry[];
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

                const parts: string[] = [];

                const symbolFeedback = this.buildSymbolDiffFeedback(relativePath);
                if (symbolFeedback) {
                    parts.push(symbolFeedback);
                }

                const newContent = String(tool_input?.new_string ?? '');
                if (newContent && this.config.dnaEntries) {
                    const dnaIssue = checkDnaViolations(
                        newContent,
                        relativePath,
                        this.config.dnaEntries,
                    );
                    if (dnaIssue) {
                        parts.push(dnaIssue);
                    }
                }

                if (parts.length > 0) {
                    return {
                        hookSpecificOutput: {
                            hookEventName: 'PostToolUse',
                            additionalContext: parts.join('\n\n'),
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

                const fileNodeId = `file:${relativePath}`;
                const communityId = this.config.graph.hasNode(fileNodeId)
                    ? (this.config.graph.getNodeAttribute(fileNodeId, 'community') as
                          | number
                          | undefined)
                    : undefined;

                this.config.attention.touchFile(relativePath, 'read', communityId);
                this.config.eventBus.emit(createEvent('file:read', { filePath: relativePath }));

                await this.config.sessionStore.recordObservation({
                    sessionId: this.config.sessionId,
                    timestamp: Date.now(),
                    toolName: tool_name,
                    event: 'file:read',
                    filePath: relativePath,
                });

                const clusterFeedback = this.buildClusterFeedback(relativePath, communityId);
                if (clusterFeedback) {
                    return {
                        hookSpecificOutput: {
                            hookEventName: 'PostToolUse',
                            additionalContext: clusterFeedback,
                        },
                    };
                }
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

    private buildClusterFeedback(
        relativePath: string,
        communityId: number | undefined,
    ): string | null {
        const cluster = this.config.attention.activeCluster();
        if (
            !cluster ||
            communityId !== cluster.communityId ||
            this.config.attention.hasDelivered(relativePath, `cluster:${cluster.communityId}`)
        ) {
            return null;
        }

        this.config.attention.markDelivered(relativePath, `cluster:${cluster.communityId}`);

        const communityFiles: string[] = [];
        this.config.graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
            if (attrs.community === cluster.communityId && nodeId.startsWith('file:')) {
                communityFiles.push(nodeId.replace('file:', ''));
            }
        });

        const unread = communityFiles.filter((f) => !this.config.attention.getFile(f));
        if (unread.length === 0) return null;

        const dirCounts = new Map<string, number>();
        for (const f of communityFiles) {
            const dir = path.dirname(f);
            dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
        }
        let bestDir = '';
        let bestCount = 0;
        for (const [dir, count] of dirCounts) {
            if (count > bestCount) {
                bestCount = count;
                bestDir = dir;
            }
        }
        const coverage = bestCount / communityFiles.length;
        const moduleName =
            coverage >= 0.6 ? `the ${path.basename(bestDir)} module` : 'a related code cluster';

        const total = communityFiles.length;
        const seen = total - unread.length;
        const suggestion = unread.slice(0, 3).join(', ');

        return [
            `You're working in ${moduleName} (${seen} of ${total} files seen).`,
            `  Not yet read: ${suggestion}`,
        ].join('\n');
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

    const lines: string[] = [`Edit applied. Symbol changes in ${path.basename(filePath)}:`];
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
