import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ImpactAnalyzer } from './impact.js';
import { computeRiskLevel } from './types.js';
import type { ImpactEntry } from './impact.js';
import type { GraphInstance, RiskLevel } from './types.js';

const execFileAsync = promisify(execFile);

export interface AffectedFile {
    filePath: string;
    nodes: ImpactEntry[];
    maxConfidence: number;
}

export interface GitImpactResult {
    changedFiles: string[];
    affectedNodes: ImpactEntry[];
    affectedFiles: AffectedFile[];
    riskLevel: RiskLevel;
    summary: string;
}

export class GitImpactAnalyzer {
    private impact: ImpactAnalyzer;

    constructor(private graph: GraphInstance) {
        this.impact = new ImpactAnalyzer(graph);
    }

    static parseGitDiffOutput(output: string): string[] {
        return output
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }

    async getWorkingChanges(cwd?: string): Promise<string[]> {
        const opts = cwd ? { cwd } : {};
        const [unstaged, staged] = await Promise.all([
            execFileAsync('git', ['diff', '--name-only'], { encoding: 'utf-8', ...opts }),
            execFileAsync('git', ['diff', '--name-only', '--cached'], {
                encoding: 'utf-8',
                ...opts,
            }),
        ]);

        const files = new Set<string>([
            ...GitImpactAnalyzer.parseGitDiffOutput(unstaged.stdout),
            ...GitImpactAnalyzer.parseGitDiffOutput(staged.stdout),
        ]);

        return [...files];
    }

    async analyzeWorkingChanges(cwd?: string): Promise<GitImpactResult> {
        const changedFiles = await this.getWorkingChanges(cwd);
        return this.analyzeFiles(changedFiles);
    }

    analyzeFiles(changedFiles: string[]): GitImpactResult {
        const visited = new Set<string>();
        const allAffected: ImpactEntry[] = [];

        for (const filePath of changedFiles) {
            const symbolNodes = this.findSymbolsInFile(filePath);

            for (const nodeId of symbolNodes) {
                const result = this.impact.getBlastRadius(nodeId, 3);

                for (const depth of Object.keys(result.depths).map(Number)) {
                    if (depth === 0) continue;
                    for (const entry of result.depths[depth]) {
                        if (!visited.has(entry.node)) {
                            visited.add(entry.node);
                            allAffected.push(entry);
                        }
                    }
                }
            }
        }

        const fileMap = new Map<string, ImpactEntry[]>();
        for (const entry of allAffected) {
            if (!this.graph.hasNode(entry.node)) continue;
            const fp = this.graph.getNodeAttribute(entry.node, 'filePath') as string;
            if (!fp) continue;
            const existing = fileMap.get(fp) ?? [];
            existing.push(entry);
            fileMap.set(fp, existing);
        }

        const affectedFiles: AffectedFile[] = [...fileMap.entries()].map(([filePath, nodes]) => ({
            filePath,
            nodes,
            maxConfidence: Math.max(...nodes.map((n) => n.confidence)),
        }));

        const maxConf =
            allAffected.length > 0 ? Math.max(...allAffected.map((e) => e.confidence)) : 0;

        const riskLevel = computeRiskLevel(maxConf);

        const summary =
            allAffected.length === 0
                ? 'No affected nodes found.'
                : `${changedFiles.length} changed file(s) affect ${allAffected.length} node(s) across ${affectedFiles.length} file(s). Risk: ${riskLevel}.`;

        return {
            changedFiles,
            affectedNodes: allAffected,
            affectedFiles,
            riskLevel,
            summary,
        };
    }

    private findSymbolsInFile(filePath: string): string[] {
        const symbols: string[] = [];

        this.graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
            if (attrs.filePath === filePath && attrs.type !== 'file') {
                symbols.push(nodeId);
            }
        });

        return symbols;
    }
}
