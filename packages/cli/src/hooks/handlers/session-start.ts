import type { HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { DnaEngine } from '#dna/engine.js';
import type { ConstraintRef } from '#hooks/handlers/pre-tool-use.js';
import type { HealthEngine, HealthReport } from '#brain/health/index.js';

const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;

export interface SessionStartHandlerConfig {
    dnaEngine: DnaEngine;
    sessionStore: SessionStore;
    constraints: ConstraintRef[];
    health: HealthEngine;
    cachedHealth: { report: HealthReport; timestamp: number } | null;
}

export class SessionStartHandler {
    private dnaEngine: DnaEngine;
    private sessionStore: SessionStore;
    private constraints: ConstraintRef[];
    private health: HealthEngine;
    private cachedHealth: { report: HealthReport; timestamp: number } | null;

    constructor(config: SessionStartHandlerConfig) {
        this.dnaEngine = config.dnaEngine;
        this.sessionStore = config.sessionStore;
        this.constraints = config.constraints;
        this.health = config.health;
        this.cachedHealth = config.cachedHealth;
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

        if (source === 'compact') {
            return this.buildCompactResponse(sessionId);
        }

        return this.buildStartupResponse();
    }

    private async buildStartupResponse(): Promise<HttpHookResponse> {
        const lines: string[] = [];

        lines.push(
            'Symbiote is active. Hook responses on file operations include\n' +
                'dependency analysis and impact previews — read and follow them.',
        );

        lines.push(
            'When you need to understand code relationships, search for Symbiote MCP tools\n' +
                '(get_impact, get_context_for_symbol, semantic_search, rename_symbol).',
        );

        const activeEntries = this.dnaEngine.getActiveEntries();
        if (activeEntries.length > 0) {
            const prose = activeEntries.map((e) => e.content).join(', ');
            lines.push(`Developer style: ${prose}`);
        }

        const activeConstraints = this.constraints.filter(
            (c) => c.scope === '*' || c.scope === 'global',
        );
        if (activeConstraints.length > 0) {
            const bulletLines = activeConstraints.map((c) => `  - ${c.content}`).join('\n');
            lines.push(`Constraints:\n${bulletLines}`);
        }

        const healthAlerts = await this.getHealthAlerts();
        if (healthAlerts) {
            lines.push(healthAlerts);
        }

        lines.push(
            'Do not use your own memory system. Use Symbiote MCP tools to capture:\n' +
                '  - record_instruction — developer corrections, style, preferences\n' +
                '  - propose_decision — architectural decisions\n' +
                '  - propose_constraint — project rules and constraints',
        );

        return {
            hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext: lines.join('\n\n'),
            },
        };
    }

    private async buildCompactResponse(sessionId: string): Promise<HttpHookResponse> {
        const lines: string[] = ['Session restored.'];

        const snapshot = await this.sessionStore.getSnapshot(sessionId);
        if (snapshot) {
            try {
                const parsed = JSON.parse(snapshot) as {
                    filesModified?: string[];
                    attention?: string[];
                };

                if (parsed.filesModified && parsed.filesModified.length > 0) {
                    lines.push(`You were editing: ${parsed.filesModified.join(', ')}.`);
                }

                if (parsed.attention && parsed.attention.length > 0) {
                    lines.push(`Focus area: ${parsed.attention.join(', ')}.`);
                }
            } catch {
                // snapshot parse failure is non-fatal
            }
        }

        lines.push("Use get_context_for_file to restore context for files you're working on.");

        return {
            hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext: lines.join('\n'),
            },
        };
    }

    private async getHealthAlerts(): Promise<string | null> {
        try {
            const report = await this.resolveHealthReport();
            const alertLines: string[] = [];

            if (report.circularDeps.length > 0) {
                const count = report.circularDeps.length;
                alertLines.push(`  - ${count} circular dependenc${count === 1 ? 'y' : 'ies'}`);
            }

            if (report.deadCode.length > 0) {
                const count = report.deadCode.length;
                alertLines.push(`  - ${count} dead function${count === 1 ? '' : 's'}`);
            }

            if (alertLines.length === 0) return null;

            return `Health alerts:\n${alertLines.join('\n')}`;
        } catch {
            return null;
        }
    }

    private async resolveHealthReport(): Promise<HealthReport> {
        if (
            this.cachedHealth !== null &&
            Date.now() - this.cachedHealth.timestamp < HEALTH_CACHE_TTL_MS
        ) {
            return this.cachedHealth.report;
        }

        const report = await this.health.analyze();
        this.cachedHealth = { report, timestamp: Date.now() };
        return report;
    }
}
