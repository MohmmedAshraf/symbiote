import path from 'node:path';
import type { PreToolUsePayload, HttpHookResponse } from '#hooks/types.js';
import type { GraphInstance } from '#core/types.js';
import type { AttentionSet } from '#hooks/attention.js';
import type { DnaEngine } from '#dna/engine.js';
import type { SymbolCache } from '#hooks/symbol-cache.js';
import type { EventBus } from '#events/bus.js';
import { createEvent } from '#events/types.js';

export interface ConstraintRef {
    scope: string;
    content: string;
    pattern?: string;
    enforcement?: 'strict' | 'warn';
}

type SymbolSnapshot = { name: string; kind: string; lineStart: number; lineEnd: number };

export interface PreToolUseHandlerConfig {
    graph: GraphInstance;
    projectRoot: string;
    constraints: ConstraintRef[];
    attention: AttentionSet;
    dnaEngine: DnaEngine;
    symbolCache?: SymbolCache;
    preEditSymbols?: Map<string, SymbolSnapshot[]>;
    eventBus?: EventBus;
}

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write']);
const PASSTHROUGH_TOOLS = new Set(['Glob', 'WebFetch', 'WebSearch']);

export class PreToolUseHandler {
    private graph: GraphInstance;
    private projectRoot: string;
    private constraints: ConstraintRef[];
    private attention: AttentionSet;
    private dnaEngine: DnaEngine;
    private symbolCache?: SymbolCache;
    private preEditSymbols?: Map<string, SymbolSnapshot[]>;
    private eventBus?: EventBus;

    constructor(config: PreToolUseHandlerConfig) {
        this.graph = config.graph;
        this.projectRoot = config.projectRoot;
        this.constraints = config.constraints;
        this.attention = config.attention;
        this.dnaEngine = config.dnaEngine;
        this.symbolCache = config.symbolCache;
        this.preEditSymbols = config.preEditSymbols;
        this.eventBus = config.eventBus;
    }

    handle(payload: PreToolUsePayload): HttpHookResponse {
        try {
            if (PASSTHROUGH_TOOLS.has(payload.tool_name)) {
                return {};
            }

            if (payload.tool_name === 'Grep') {
                return this.handleGrepTool(payload);
            }

            if (payload.tool_name === 'Agent') {
                return this.handleAgentTool();
            }

            if (payload.tool_name === 'Bash') {
                return this.handleBashTool(payload);
            }

            if (FILE_TOOLS.has(payload.tool_name)) {
                return this.handleFileTool(payload);
            }

            return {};
        } catch {
            return {};
        }
    }

    private handleFileTool(payload: PreToolUsePayload): HttpHookResponse {
        const filePath = payload.tool_input.file_path as string | undefined;
        if (!filePath) {
            return {};
        }

        if (
            payload.tool_name === 'Write' &&
            filePath.includes('/.claude/') &&
            filePath.includes('/memory/')
        ) {
            return {
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'deny',
                    additionalContext:
                        'Do not use your own memory. Use Symbiote MCP tools instead:\n' +
                        '  - record_instruction — corrections, style, preferences\n' +
                        '  - propose_decision — architectural decisions\n' +
                        '  - propose_constraint — project rules and constraints',
                },
            };
        }

        const relativePath = path.isAbsolute(filePath)
            ? path.relative(this.projectRoot, filePath)
            : filePath;

        this.attention.touchFile(relativePath);

        const fileNodeId = `file:${relativePath}`;
        if (!this.graph.hasNode(fileNodeId)) {
            return {};
        }

        const symbols = this.collectSymbols(fileNodeId);
        const dependencies = this.collectDependencies(symbols);
        const dependents = this.collectDependents(symbols);
        const matchingConstraints = this.findMatchingConstraints(relativePath);

        const lines: string[] = [];
        lines.push(`File context for ${relativePath}:`);

        if (symbols.length > 0) {
            lines.push('');
            lines.push('Symbols in this file:');
            for (const sym of symbols) {
                if (!this.graph.hasNode(sym)) continue;
                const attrs = this.graph.getNodeAttributes(sym);
                lines.push(
                    `  - ${attrs.name} (${attrs.type}, lines ${attrs.lineStart}-${attrs.lineEnd})`,
                );
            }
        }

        if (dependencies.length > 0) {
            lines.push('');
            lines.push('Dependencies:');
            for (const dep of dependencies) {
                if (!this.graph.hasNode(dep)) continue;
                const attrs = this.graph.getNodeAttributes(dep);
                lines.push(`  - ${attrs.name} (${attrs.filePath})`);
            }
        }

        if (dependents.length > 0) {
            lines.push('');
            lines.push('Dependents:');
            for (const dep of dependents) {
                if (!this.graph.hasNode(dep)) continue;
                const attrs = this.graph.getNodeAttributes(dep);
                lines.push(`  - ${attrs.name} (${attrs.filePath})`);
            }

            if (!this.attention.hasDelivered(relativePath, 'blind_spots')) {
                const unreadDeps = dependents.filter((dep) => {
                    if (!this.graph.hasNode(dep)) return false;
                    const attrs = this.graph.getNodeAttributes(dep);
                    const depFile = attrs.filePath as string | undefined;
                    return depFile && !this.attention.getFile(depFile);
                });

                if (unreadDeps.length > 0) {
                    const topUnread = this.graph.getNodeAttributes(unreadDeps[0]);
                    lines.push('');
                    lines.push(
                        `Blind spot: ${topUnread.name} (${topUnread.filePath}) is a dependent you haven't read yet.`,
                    );
                    this.attention.markDelivered(relativePath, 'blind_spots');
                }
            }
        }

        if (matchingConstraints.length > 0) {
            lines.push('');
            lines.push('Constraints:');
            for (const constraint of matchingConstraints) {
                lines.push(`  - [${constraint.scope}] ${constraint.content}`);
            }
        }

        if (payload.tool_name === 'Edit' || payload.tool_name === 'Write') {
            this.stashPreEditSymbols(relativePath, symbols);

            const newContent = String(payload.tool_input?.new_string ?? '');
            if (newContent) {
                const violation = this.checkConstraintViolation(newContent, matchingConstraints);
                if (violation) {
                    if (violation.enforcement === 'strict') {
                        this.eventBus?.emit(
                            createEvent('constraint:blocked', {
                                filePath: relativePath,
                                metadata: { constraint: violation.content },
                            }),
                        );
                        return {
                            hookSpecificOutput: {
                                hookEventName: 'PreToolUse',
                                permissionDecision: 'deny',
                                additionalContext: [
                                    ...lines,
                                    '',
                                    `Blocked: This edit violates constraint "${violation.content}"`,
                                    `  Scope: ${violation.scope}`,
                                    '  Review the constraint and adjust your approach.',
                                ].join('\n'),
                            },
                        };
                    }
                    lines.push(
                        '',
                        `Warning: This edit may violate constraint "${violation.content}"`,
                    );
                }
            }

            if (dependents.length >= 10) {
                const topDeps = dependents
                    .slice(0, 3)
                    .filter((d) => this.graph.hasNode(d))
                    .map((d) => String(this.graph.getNodeAttribute(d, 'name')))
                    .join(', ');
                lines.push('');
                lines.push(
                    `High-impact edit: ${path.basename(relativePath)} has ${dependents.length} dependents.`,
                );
                lines.push(`  Most critical: ${topDeps}`);
                lines.push(`  After editing, verify at minimum: ${topDeps}`);
            } else if (dependents.length > 0) {
                const depNames = dependents
                    .filter((d) => this.graph.hasNode(d))
                    .map((d) => String(this.graph.getNodeAttribute(d, 'name')))
                    .join(', ');
                lines.push('');
                lines.push('Impact preview:');
                lines.push(`  Dependents affected: ${depNames}`);
                lines.push('  After editing, verify these files still work correctly.');
            }
        }

        return {
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                additionalContext: lines.join('\n'),
            },
        };
    }

    private handleGrepTool(payload: PreToolUsePayload): HttpHookResponse {
        const pattern = String(payload.tool_input?.pattern ?? '');
        if (this.symbolCache) {
            const match = this.symbolCache.get(pattern);
            if (match) {
                let context = `Graph match: "${pattern}" is defined in ${match.filePath}:${match.line} (${match.kind})`;

                const callers = this.findCallers(pattern);
                if (callers.length > 0) {
                    context += `\n  Called by: ${callers.slice(0, 5).join(', ')}`;
                }

                return {
                    hookSpecificOutput: {
                        hookEventName: 'PreToolUse',
                        additionalContext: context,
                    },
                };
            }
        }
        return {};
    }

    private findCallers(symbolName: string): string[] {
        const callers: string[] = [];
        const targetNodes: string[] = [];

        this.graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
            if (attrs.name === symbolName) {
                targetNodes.push(nodeId);
            }
        });

        for (const nodeId of targetNodes) {
            this.graph.forEachInEdge(
                nodeId,
                (_edge: string, attrs: Record<string, unknown>, source: string) => {
                    if (attrs.type !== 'contains') {
                        const sourceAttrs = this.graph.getNodeAttributes(source);
                        const file = sourceAttrs.filePath as string | undefined;
                        const line = sourceAttrs.lineStart as number | undefined;
                        if (file && line) {
                            callers.push(`${path.basename(file)}:${line}`);
                        } else if (file) {
                            callers.push(path.basename(file));
                        }
                    }
                },
            );
        }

        return callers;
    }

    private handleAgentTool(): HttpHookResponse {
        const lines: string[] = [];

        const activeEntries = this.dnaEngine
            .getActiveEntries()
            .slice(0, 10)
            .map((e) => `[${e.category}] ${e.rule}`);

        if (activeEntries.length > 0) {
            lines.push('Developer DNA (active):');
            for (const entry of activeEntries) {
                lines.push(`  - ${entry}`);
            }
        }

        const activeConstraints = this.constraints.filter(
            (c) => c.scope === '*' || c.scope === 'global',
        );

        if (activeConstraints.length > 0) {
            if (lines.length > 0) lines.push('');
            lines.push('Active constraints:');
            for (const c of activeConstraints) {
                lines.push(`  - [${c.scope}] ${c.content}`);
            }
        }

        if (lines.length === 0) {
            return {};
        }

        return {
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                additionalContext: lines.join('\n'),
            },
        };
    }

    private handleBashTool(payload: PreToolUsePayload): HttpHookResponse {
        const command = payload.tool_input.command as string | undefined;
        if (!command) {
            return {};
        }

        const filePathMatch = command.match(
            /(?:^|\s)((?:\.{1,2}\/)?[\w./-]+\.(?:ts|js|tsx|jsx|py|go|rs|java|rb|php|cs|cpp|c|h))/,
        );
        if (!filePathMatch) {
            return {};
        }

        const rawPath = filePathMatch[1];
        const relativePath = path.isAbsolute(rawPath)
            ? path.relative(this.projectRoot, rawPath)
            : rawPath;

        const fileNodeId = `file:${relativePath}`;
        if (!this.graph.hasNode(fileNodeId)) {
            return {};
        }

        this.attention.touchFile(relativePath);

        const symbols = this.collectSymbols(fileNodeId);
        const matchingConstraints = this.findMatchingConstraints(relativePath);

        const lines: string[] = [];
        lines.push(`File context for ${relativePath}:`);

        if (symbols.length > 0) {
            lines.push('');
            lines.push('Symbols in this file:');
            for (const sym of symbols) {
                if (!this.graph.hasNode(sym)) continue;
                const attrs = this.graph.getNodeAttributes(sym);
                lines.push(
                    `  - ${attrs.name} (${attrs.type}, lines ${attrs.lineStart}-${attrs.lineEnd})`,
                );
            }
        }

        if (matchingConstraints.length > 0) {
            lines.push('');
            lines.push('Constraints:');
            for (const c of matchingConstraints) {
                lines.push(`  - [${c.scope}] ${c.content}`);
            }
        }

        return {
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                additionalContext: lines.join('\n'),
            },
        };
    }

    private stashPreEditSymbols(relativePath: string, symbols: string[]): void {
        if (!this.preEditSymbols) return;
        const stashed: SymbolSnapshot[] = [];
        for (const sym of symbols) {
            if (!this.graph.hasNode(sym)) continue;
            const attrs = this.graph.getNodeAttributes(sym);
            stashed.push({
                name: String(attrs.name ?? ''),
                kind: String(attrs.type ?? ''),
                lineStart: Number(attrs.lineStart ?? 0),
                lineEnd: Number(attrs.lineEnd ?? 0),
            });
        }
        this.preEditSymbols.set(relativePath, stashed);
    }

    private collectSymbols(fileNodeId: string): string[] {
        const symbols: string[] = [];

        this.graph.forEachOutEdge(
            fileNodeId,
            (_edge: string, attrs: Record<string, unknown>, _source: string, target: string) => {
                if (attrs.type === 'contains') {
                    symbols.push(target);
                }
            },
        );

        return symbols;
    }

    private collectDependencies(symbols: string[]): string[] {
        const deps = new Set<string>();
        const symbolSet = new Set(symbols);

        for (const symbol of symbols) {
            this.graph.forEachOutEdge(
                symbol,
                (
                    _edge: string,
                    attrs: Record<string, unknown>,
                    _source: string,
                    target: string,
                ) => {
                    if (attrs.type !== 'contains' && !symbolSet.has(target)) {
                        deps.add(target);
                    }
                },
            );
        }

        return [...deps];
    }

    private collectDependents(symbols: string[]): string[] {
        const dependents = new Set<string>();
        const symbolSet = new Set(symbols);

        for (const symbol of symbols) {
            this.graph.forEachInEdge(
                symbol,
                (_edge: string, attrs: Record<string, unknown>, source: string) => {
                    if (attrs.type !== 'contains' && !symbolSet.has(source)) {
                        dependents.add(source);
                    }
                },
            );
        }

        return [...dependents];
    }

    private checkConstraintViolation(
        content: string,
        constraints: ConstraintRef[],
    ): ConstraintRef | null {
        for (const constraint of constraints) {
            if (!constraint.pattern) continue;
            try {
                const regex = new RegExp(constraint.pattern);
                if (regex.test(content)) {
                    return constraint;
                }
            } catch {
                continue;
            }
        }
        return null;
    }

    private findMatchingConstraints(relativePath: string): ConstraintRef[] {
        return this.constraints.filter((c) => {
            if (c.scope === '*' || c.scope === 'global') return true;
            return relativePath.startsWith(c.scope) || relativePath.includes(c.scope);
        });
    }
}
