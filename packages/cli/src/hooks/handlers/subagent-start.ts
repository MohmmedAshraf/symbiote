import type { SubagentStartPayload, HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { DnaEngine } from '#dna/engine.js';
import type { ConstraintRef } from './pre-tool-use.js';

export interface SubagentStartHandlerConfig {
    dnaEngine: DnaEngine;
    constraints: ConstraintRef[];
    sessionStore: SessionStore;
    sessionId: string;
}

export class SubagentStartHandler {
    private config: SubagentStartHandlerConfig;

    constructor(config: SubagentStartHandlerConfig) {
        this.config = config;
    }

    async handle(payload: SubagentStartPayload): Promise<HttpHookResponse> {
        try {
            return await this.processPayload(payload);
        } catch {
            return {};
        }
    }

    private async processPayload(payload: SubagentStartPayload): Promise<HttpHookResponse> {
        await this.config.sessionStore.recordObservation({
            sessionId: this.config.sessionId,
            timestamp: Date.now(),
            toolName: 'Agent',
            event: 'subagent',
            metadata: { agent_type: payload.agent_type },
        });

        const dnaRules = this.config.dnaEngine
            .getActiveEntries()
            .slice(0, 5)
            .map((e) => e.content);

        const constraintLines = this.config.constraints
            .filter((c) => c.scope === '*' || c.scope === 'global')
            .slice(0, 5)
            .map((c) => c.content);

        const parts: string[] = [];

        if (dnaRules.length > 0) {
            parts.push(`[Symbiote] DNA: ${dnaRules.join(', ')}`);
        }

        if (constraintLines.length > 0) {
            parts.push(`Constraints: ${constraintLines.join(', ')}`);
        }

        if (parts.length === 0) {
            return {};
        }

        return {
            hookSpecificOutput: {
                hookEventName: 'SubagentStart',
                additionalContext: parts.join('\n'),
            },
        };
    }
}
