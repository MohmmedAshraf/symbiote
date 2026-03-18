import type { StopPayload, HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { AttentionSet } from '#hooks/attention.js';
import type { DnaEngine } from '#dna/engine.js';

export interface StopHandlerConfig {
    sessionStore: SessionStore;
    attention: AttentionSet;
    dnaEngine: DnaEngine;
}

const HEAVYWEIGHT_INTERVAL = 10;

export class StopHandler {
    private sessionStore: SessionStore;
    private attention: AttentionSet;
    private dnaEngine: DnaEngine;
    private interactionCount = 0;
    private lastHeavyweightAt = 0;

    constructor(config: StopHandlerConfig) {
        this.sessionStore = config.sessionStore;
        this.attention = config.attention;
        this.dnaEngine = config.dnaEngine;
    }

    async handle(payload: StopPayload): Promise<HttpHookResponse> {
        try {
            await this.processPayload(payload);
        } catch {
            // Hooks must never fail
        }

        return {};
    }

    private async processPayload(payload: StopPayload): Promise<void> {
        this.attention.tick();
        this.interactionCount += 1;

        if (this.interactionCount - this.lastHeavyweightAt >= HEAVYWEIGHT_INTERVAL) {
            this.lastHeavyweightAt = this.interactionCount;
            await this.runHeavyweightAnalysis(payload.session_id);
        }
    }

    private async runHeavyweightAnalysis(sessionId: string): Promise<void> {
        const hotspots = await this.sessionStore.getHotspots(sessionId, 3);

        if (hotspots.length === 0) {
            return;
        }

        for (const filePath of hotspots) {
            this.dnaEngine.captureInstruction(
                `Frequently editing ${filePath}`,
                sessionId,
                'pattern',
            );
        }
    }
}
