import path from 'node:path';
import type { PostToolUseFailurePayload, HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { AttentionSet } from '#hooks/attention.js';
import type { GraphInstance } from '#core/types.js';
import { EventBus } from '#events/bus.js';
import { createEvent } from '#events/types.js';

export interface PostToolUseFailureHandlerConfig {
    sessionStore: SessionStore;
    attention: AttentionSet;
    eventBus: EventBus;
    graph: GraphInstance;
    projectRoot: string;
    sessionId: string;
}

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

export class PostToolUseFailureHandler {
    private config: PostToolUseFailureHandlerConfig;

    constructor(config: PostToolUseFailureHandlerConfig) {
        this.config = config;
    }

    async handle(payload: PostToolUseFailurePayload): Promise<HttpHookResponse> {
        try {
            await this.processPayload(payload);
        } catch {
            // Hooks must never fail
        }

        return {};
    }

    private async processPayload(payload: PostToolUseFailurePayload): Promise<void> {
        const rawPath =
            typeof payload.tool_input.file_path === 'string'
                ? payload.tool_input.file_path
                : undefined;

        let relativePath: string | undefined;
        let symbolIds: string[] = [];

        if (rawPath) {
            relativePath = toRelative(this.config.projectRoot, rawPath);
            symbolIds = collectSymbolIds(this.config.graph, `file:${relativePath}`);
            this.config.attention.touchFile(relativePath);
        }

        await this.config.sessionStore.recordObservation({
            sessionId: this.config.sessionId,
            timestamp: Date.now(),
            toolName: payload.tool_name,
            event: 'tool_failure',
            filePath: relativePath,
            symbolsAffected: symbolIds.length > 0 ? symbolIds : undefined,
            metadata: { error: payload.error },
        });

        this.config.eventBus.emit(
            createEvent('intelligence:finding', {
                filePath: relativePath,
                nodeIds: symbolIds.length > 0 ? symbolIds : undefined,
                toolName: payload.tool_name,
                metadata: { error: payload.error },
            }),
        );
    }
}
