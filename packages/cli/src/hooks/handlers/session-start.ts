import fs from 'node:fs';
import path from 'node:path';
import type { HttpHookResponse } from '#hooks/types.js';
import type { SessionStore } from '#hooks/session-store.js';
import type { DnaEngine } from '#dna/engine.js';
import type { ConstraintRef } from '#hooks/handlers/pre-tool-use.js';
import type { HealthEngine, HealthReport } from '#brain/health/index.js';

const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;
const OVERVIEW_STALE_DAYS = 14;

export interface SessionStartHandlerConfig {
    dnaEngine: DnaEngine;
    sessionStore: SessionStore;
    constraints: ConstraintRef[];
    health: HealthEngine;
    cachedHealth: { report: HealthReport; timestamp: number } | null;
    brainDir: string;
    rootDir: string;
}

export class SessionStartHandler {
    private dnaEngine: DnaEngine;
    private sessionStore: SessionStore;
    private constraints: ConstraintRef[];
    private health: HealthEngine;
    private cachedHealth: { report: HealthReport; timestamp: number } | null;
    private brainDir: string;
    private rootDir: string;

    constructor(config: SessionStartHandlerConfig) {
        this.dnaEngine = config.dnaEngine;
        this.sessionStore = config.sessionStore;
        this.constraints = config.constraints;
        this.health = config.health;
        this.cachedHealth = config.cachedHealth;
        this.brainDir = config.brainDir;
        this.rootDir = config.rootDir;
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
            'Symbiote is active. ALWAYS use Symbiote MCP tools instead of manual search:\n' +
                '  Context:\n' +
                '    get_project_overview — project summary, stats, constraints, decisions\n' +
                '    get_context_for_file — nodes, dependencies, dependents for a file\n' +
                '    get_context_for_symbol — symbol relationships and references\n' +
                '    get_developer_dna — coding style and preferences\n' +
                '  Analysis:\n' +
                '    get_impact — ripple effects of changing a file or symbol\n' +
                '    get_architecture — layers, communities, hubs, violations\n' +
                '    get_health — constraint violations, circular deps, dead code, coupling\n' +
                '    detect_changes — what changed since last scan\n' +
                '  Search:\n' +
                '    semantic_search — find code by meaning\n' +
                '    query_graph — search nodes, dependencies, dependents, hubs\n' +
                '    find_patterns — code smells, style deviations, architectural issues\n' +
                '  Actions:\n' +
                '    rename_symbol — safe cross-file renames\n' +
                '    get_constraints / get_decisions — list project rules and choices\n' +
                'Hook responses on file operations include dependency analysis — read and follow them.',
        );

        const activeEntries = this.dnaEngine.getActiveEntries();
        if (activeEntries.length > 0) {
            const dnaLines = activeEntries.slice(0, 10).map((e) => `  - [${e.category}] ${e.rule}`);
            lines.push(`Developer DNA (active):\n${dnaLines.join('\n')}`);
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

        const overviewNudge = this.checkOverviewStaleness();
        if (overviewNudge) {
            lines.push(overviewNudge);
        }

        lines.push(
            'Do not use your own memory system. Use Symbiote MCP tools to capture:\n' +
                '  record_instruction — developer corrections, style, preferences\n' +
                '  propose_decision — architectural decisions\n' +
                '  propose_constraint — project rules and constraints',
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

    private checkOverviewStaleness(): string | null {
        try {
            const overviewPath = path.join(this.brainDir, 'intent', 'overview.md');
            if (!fs.existsSync(overviewPath)) {
                return (
                    'No project overview found. Write `.brain/intent/overview.md` with a concise ' +
                    'summary of this project (tech stack, architecture, key patterns, entry points). ' +
                    'Keep it under 40 lines.'
                );
            }

            const overviewMtime = fs.statSync(overviewPath).mtimeMs;
            const now = Date.now();
            const ageDays = (now - overviewMtime) / (1000 * 60 * 60 * 24);

            const pkgPath = path.join(this.rootDir, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkgMtime = fs.statSync(pkgPath).mtimeMs;
                if (pkgMtime > overviewMtime) {
                    return (
                        'Project dependencies changed since the overview was written. ' +
                        'Update `.brain/intent/overview.md` if the tech stack or architecture shifted.'
                    );
                }
            }

            if (ageDays > OVERVIEW_STALE_DAYS) {
                return (
                    `Project overview is ${Math.round(ageDays)} days old. ` +
                    'Consider updating `.brain/intent/overview.md` if the project has evolved.'
                );
            }

            return null;
        } catch {
            return null;
        }
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
