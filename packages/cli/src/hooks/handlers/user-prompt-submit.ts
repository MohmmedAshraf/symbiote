import type { UserPromptSubmitPayload, HttpHookResponse } from '#hooks/types.js';
import type { DnaEngine } from '#dna/engine.js';

export interface UserPromptSubmitHandlerConfig {
    dnaEngine: DnaEngine;
}

const CORRECTION_PATTERN = /\b(don'?t|do not|never|stop|avoid)\b/i;
const PREFERENCE_PATTERN = /\b(prefer|instead of|rather than|switch to|use .+ over)\b/i;
const REINFORCEMENT_PATTERN = /\b(yes exactly|perfect|that'?s right|keep doing)\b/i;

function hasSignificantPattern(prompt: string): boolean {
    return (
        CORRECTION_PATTERN.test(prompt) ||
        PREFERENCE_PATTERN.test(prompt) ||
        REINFORCEMENT_PATTERN.test(prompt)
    );
}

export class UserPromptSubmitHandler {
    private dnaEngine: DnaEngine;

    constructor(config: UserPromptSubmitHandlerConfig) {
        this.dnaEngine = config.dnaEngine;
    }

    async handle(payload: UserPromptSubmitPayload): Promise<HttpHookResponse> {
        try {
            await this.processPayload(payload);
        } catch {
            // Hooks must never fail
        }

        return {};
    }

    private async processPayload(payload: UserPromptSubmitPayload): Promise<void> {
        const { prompt, session_id } = payload;

        if (!prompt || !hasSignificantPattern(prompt)) {
            return;
        }

        await this.dnaEngine.captureInstructionWithPatternMatch(prompt, session_id, 'pattern');
    }
}
