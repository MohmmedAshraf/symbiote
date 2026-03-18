import path from 'node:path';
import type { PreToolUsePayload, HttpHookResponse } from '#hooks/types.js';
import type { GraphInstance } from '#core/types.js';
import type { AttentionSet } from '#hooks/attention.js';
import type { DnaEngine } from '#dna/engine.js';

export interface ConstraintRef {
    scope: string;
    content: string;
}

export interface PreToolUseHandlerConfig {
    graph: GraphInstance;
    projectRoot: string;
    constraints: ConstraintRef[];
    attention: AttentionSet;
    dnaEngine: DnaEngine;
}

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write']);
const PASSTHROUGH_TOOLS = new Set(['Grep', 'Glob', 'WebFetch', 'WebSearch']);
const IMPACT_DEPENDENT_THRESHOLD = 5;

export class PreToolUseHandler {
    private graph: GraphInstance;
    private projectRoot: string;
    private constraints: ConstraintRef[];
    private attention: AttentionSet;
    private dnaEngine: DnaEngine;

    constructor(config: PreToolUseHandlerConfig) {
        this.graph = config.graph;
        this.projectRoot = config.projectRoot;
        this.constraints = config.constraints;
        this.attention = config.attention;
        this.dnaEngine = config.dnaEngine;
    }

    handle(payload: PreToolUsePayload): HttpHookResponse {
        if (PASSTHROUGH_TOOLS.has(payload.tool_name)) {
            return {};
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
    }

    private handleFileTool(payload: PreToolUsePayload): HttpHookResponse {
        const filePath = payload.tool_input.file_path as string | undefined;
        if (!filePath) {
            return {};
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
        }

        if (matchingConstraints.length > 0) {
            lines.push('');
            lines.push('Constraints:');
            for (const constraint of matchingConstraints) {
                lines.push(`  - [${constraint.scope}] ${constraint.content}`);
            }
        }

        if (
            (payload.tool_name === 'Edit' || payload.tool_name === 'Write') &&
            dependents.length > IMPACT_DEPENDENT_THRESHOLD
        ) {
            lines.push('');
            lines.push(
                `Impact warning: ${dependents.length} dependents will be affected by changes to this file.`,
            );
        }

        return {
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                additionalContext: lines.join('\n'),
            },
        };
    }

    private handleAgentTool(): HttpHookResponse {
        const lines: string[] = [];

        const activeEntries = this.dnaEngine
            .getActiveEntries()
            .slice(0, 10)
            .map((e) => `[${e.frontmatter.category}] ${e.content}`);

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

    private findMatchingConstraints(relativePath: string): ConstraintRef[] {
        return this.constraints.filter((c) => {
            if (c.scope === '*' || c.scope === 'global') return true;
            return relativePath.startsWith(c.scope) || relativePath.includes(c.scope);
        });
    }
}
