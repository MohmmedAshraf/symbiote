import type { SessionEndPayload, HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { DnaEngine } from '#dna/engine.js';
import { EventBus } from '#events/bus.js';
import { createEvent } from '#events/types.js';

export interface SessionEndHandlerConfig {
    sessionStore: SessionStore;
    dnaEngine: DnaEngine;
    eventBus: EventBus;
}

export class SessionEndHandler {
    private sessionStore: SessionStore;
    private dnaEngine: DnaEngine;
    private eventBus: EventBus;

    constructor(config: SessionEndHandlerConfig) {
        this.sessionStore = config.sessionStore;
        this.dnaEngine = config.dnaEngine;
        this.eventBus = config.eventBus;
    }

    async handle(payload: SessionEndPayload): Promise<HttpHookResponse> {
        try {
            await this.processPayload(payload);
        } catch {
            // Hooks must never fail
        }

        return {};
    }

    private async processPayload(payload: SessionEndPayload): Promise<void> {
        const { session_id, reason } = payload;

        const session = await this.sessionStore.getSession(session_id);
        if (!session) {
            return;
        }

        const toolCounts = await this.sessionStore.getToolCounts(session_id);
        const hotspots = await this.sessionStore.getHotspots(session_id, 1);

        await this.sessionStore.endSession(session_id, {
            endedAt: Date.now(),
            reason,
            filesTouched: hotspots,
            toolCounts,
        });

        this.dnaEngine.batchPassiveReinforce();
        this.dnaEngine.autoPromote();
        this.dnaEngine.decayUnseenEntries(session_id);

        this.eventBus.emit(
            createEvent('intelligence:snapshot', {
                metadata: { sessionId: session_id, reason, toolCounts },
            }),
        );
    }
}
