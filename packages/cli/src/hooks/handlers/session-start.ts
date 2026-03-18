import type { HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { DnaEngine } from '#dna/engine.js';
import type { ConstraintRef } from '#hooks/handlers/pre-tool-use.js';

export interface SessionStartHandlerConfig {
    dnaEngine: DnaEngine;
    sessionStore: SessionStore;
    constraints: ConstraintRef[];
    projectName: string;
    fileCount: number;
}

export class SessionStartHandler {
    private dnaEngine: DnaEngine;
    private sessionStore: SessionStore;
    private constraints: ConstraintRef[];
    private projectName: string;
    private fileCount: number;

    constructor(config: SessionStartHandlerConfig) {
        this.dnaEngine = config.dnaEngine;
        this.sessionStore = config.sessionStore;
        this.constraints = config.constraints;
        this.projectName = config.projectName;
        this.fileCount = config.fileCount;
    }

    async handle(input: { sessionId: string; source: string }): Promise<HttpHookResponse> {
        try {
            return await this.buildResponse(input);
        } catch {
            return {};
        }
    }

    private async buildResponse(input: {
        sessionId: string;
        source: string;
    }): Promise<HttpHookResponse> {
        const { sessionId, source } = input;

        const activeEntries = this.dnaEngine.getActiveEntries().slice(0, 5);
        const dnaRules = activeEntries.map((e) => e.content).join(', ');

        const activeConstraints = this.constraints.filter(
            (c) => c.scope === '*' || c.scope === 'global',
        );

        const lines: string[] = [];

        lines.push(`[Symbiote] Project: ${this.projectName} (${this.fileCount} files)`);

        if (dnaRules) {
            lines.push(`DNA: ${dnaRules}`);
        }

        if (activeConstraints.length > 0) {
            const constraintText = activeConstraints.map((c) => c.content).join(', ');
            lines.push(`Constraints: ${constraintText}`);
        }

        if (source === 'compact') {
            const snapshot = await this.sessionStore.getSnapshot(sessionId);
            if (snapshot) {
                try {
                    const parsed = JSON.parse(snapshot) as {
                        filesModified?: string[];
                        attention?: string[];
                    };

                    if (parsed.filesModified && parsed.filesModified.length > 0) {
                        lines.push(
                            `Files modified this session: ${parsed.filesModified.join(', ')}`,
                        );
                    }

                    if (parsed.attention && parsed.attention.length > 0) {
                        lines.push(`Active attention: ${parsed.attention.join(', ')}`);
                    }
                } catch {
                    lines.push(snapshot);
                }
            }
        }

        return {
            hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext: lines.join('\n'),
            },
        };
    }
}
