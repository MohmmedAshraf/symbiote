import path from 'node:path';
import { createRequire } from 'node:module';
import type { PreToolUsePayload, HookResponse } from './types.js';

const require = createRequire(import.meta.url);
const Graph = require('graphology');

type GraphInstance = InstanceType<typeof Graph>;

export interface ConstraintRef {
    scope: string;
    content: string;
}

export interface DnaRef {
    id: string;
    content: string;
}

export interface PreToolUseConfig {
    graph: GraphInstance;
    projectRoot: string;
    constraints: ConstraintRef[];
    dnaEntries: DnaRef[];
}

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write']);

export class PreToolUseHandler {
    private graph: GraphInstance;
    private projectRoot: string;
    private constraints: ConstraintRef[];

    constructor(config: PreToolUseConfig) {
        this.graph = config.graph;
        this.projectRoot = config.projectRoot;
        this.constraints = config.constraints;
    }

    handle(payload: PreToolUsePayload): HookResponse {
        if (!FILE_TOOLS.has(payload.tool_name)) {
            return { decision: 'allow' };
        }

        const filePath = payload.tool_input.file_path as string | undefined;
        if (!filePath) {
            return { decision: 'allow' };
        }

        const relativePath = path.isAbsolute(filePath)
            ? path.relative(this.projectRoot, filePath)
            : filePath;

        const fileNodeId = `file:${relativePath}`;

        if (!this.graph.hasNode(fileNodeId)) {
            return { decision: 'allow' };
        }

        const symbols = this.collectSymbols(fileNodeId);
        const dependencies = this.collectDependencies(symbols);
        const dependents = this.collectDependents(symbols);
        const matchingConstraints = this.findMatchingConstraints(relativePath);

        const message = this.formatMessage(
            relativePath,
            symbols,
            dependencies,
            dependents,
            matchingConstraints,
        );

        return { decision: 'allow', message };
    }

    private collectSymbols(fileNodeId: string): string[] {
        const symbols: string[] = [];

        this.graph.forEachOutEdge(
            fileNodeId,
            (edge: string, attrs: Record<string, unknown>, _source: string, target: string) => {
                if (attrs.type === 'contains') {
                    symbols.push(target);
                }
            },
        );

        return symbols;
    }

    private collectDependencies(symbols: string[]): string[] {
        const deps = new Set<string>();

        for (const symbol of symbols) {
            this.graph.forEachOutEdge(
                symbol,
                (
                    _edge: string,
                    attrs: Record<string, unknown>,
                    _source: string,
                    target: string,
                ) => {
                    if (attrs.type !== 'contains' && !symbols.includes(target)) {
                        deps.add(target);
                    }
                },
            );
        }

        return [...deps];
    }

    private collectDependents(symbols: string[]): string[] {
        const dependents = new Set<string>();

        for (const symbol of symbols) {
            this.graph.forEachInEdge(
                symbol,
                (_edge: string, attrs: Record<string, unknown>, source: string) => {
                    if (attrs.type !== 'contains' && !symbols.includes(source)) {
                        dependents.add(source);
                    }
                },
            );
        }

        return [...dependents];
    }

    private findMatchingConstraints(relativePath: string): ConstraintRef[] {
        return this.constraints.filter((c) => {
            if (c.scope === '*') return true;
            return relativePath.startsWith(c.scope) || relativePath.includes(c.scope);
        });
    }

    private formatMessage(
        relativePath: string,
        symbols: string[],
        dependencies: string[],
        dependents: string[],
        matchingConstraints: ConstraintRef[],
    ): string {
        const lines: string[] = [];

        lines.push(`File context for ${relativePath}:`);

        if (symbols.length > 0) {
            lines.push('');
            lines.push('Symbols in this file:');
            for (const sym of symbols) {
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
                const attrs = this.graph.getNodeAttributes(dep);
                lines.push(`  - ${attrs.name} (${attrs.filePath})`);
            }
        }

        if (dependents.length > 0) {
            lines.push('');
            lines.push('Dependents:');
            for (const dep of dependents) {
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

        return lines.join('\n');
    }
}
