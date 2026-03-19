import path from 'node:path';
import type { PostToolUsePayload, HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { AttentionSet } from '#hooks/attention.js';
import type { GraphInstance } from '#core/types.js';
import { EventBus } from '#events/bus.js';
import { createEvent } from '#events/types.js';

export interface PostToolUseHandlerConfig {
    projectRoot: string;
    onReindexFile: (relativePath: string) => Promise<void>;
    onFullRescan: () => Promise<void>;
    sessionStore: SessionStore;
    attention: AttentionSet;
    eventBus: EventBus;
    graph: GraphInstance;
    sessionId: string;
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
            await this.processPayload(payload);
        } catch {
            // Hooks must never fail
        }

        return {};
    }

    private async processPayload(payload: PostToolUsePayload): Promise<void> {
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
            }
            return;
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
            return;
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
            return;
        }

        await this.config.sessionStore.recordObservation({
            sessionId: this.config.sessionId,
            timestamp: Date.now(),
            toolName: tool_name,
            event: 'tool:use',
        });
    }
}
