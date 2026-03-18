import type { PreCompactPayload, HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { AttentionSet } from '#hooks/attention.js';
import { EventBus } from '#events/bus.js';
import { createEvent } from '#events/types.js';

export interface PreCompactHandlerConfig {
    sessionStore: SessionStore;
    attention: AttentionSet;
    eventBus: EventBus;
    sessionId: string;
}

const COMPACT_CONTEXT =
    "Session context preserved by Symbiote. After compaction, use get_project_overview and get_context_for_file MCP tools to restore context for files you're working on.";

export class PreCompactHandler {
    private config: PreCompactHandlerConfig;

    constructor(config: PreCompactHandlerConfig) {
        this.config = config;
    }

    async handle(payload: PreCompactPayload): Promise<HttpHookResponse> {
        try {
            return await this.processPayload(payload);
        } catch {
            return {};
        }
    }

    private async processPayload(_payload: PreCompactPayload): Promise<HttpHookResponse> {
        const snapshot = this.config.attention.toSnapshot();
        await this.config.sessionStore.saveSnapshot(
            this.config.sessionId,
            JSON.stringify(snapshot),
        );

        this.config.eventBus.emit(createEvent('intelligence:snapshot', {}));

        return {
            hookSpecificOutput: {
                hookEventName: 'PreCompact',
                additionalContext: COMPACT_CONTEXT,
            },
        };
    }
}
