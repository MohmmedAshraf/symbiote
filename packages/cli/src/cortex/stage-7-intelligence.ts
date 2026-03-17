import { execSync } from 'node:child_process';
import { CortexRepository } from './repository.js';
import {
    detectGodClasses,
    detectCircularDependencies,
    detectLayerViolations,
    detectComplexityHotspots,
} from './patterns.js';
import type { Finding, TemporalSnapshot } from './topology-types.js';
import type { StageResult, StageError } from './types.js';
import type { DnaEntry } from '../dna/types.js';

interface NodePattern {
    nodeId: string;
    filePath: string;
    usesPromiseChains: boolean;
    usesAsyncAwait: boolean;
}

interface ObservedPattern {
    nodeId: string;
    filePath: string;
    pattern: string;
    description: string;
}

interface ChangeRecord {
    file: string;
    changedWith: string[];
}

interface PredictImpactOptions {
    minCoOccurrence: number;
}

export async function collectFindings(repo: CortexRepository): Promise<Finding[]> {
    const findings: Finding[] = [];

    const classes = await repo.getAllClasses();
    const methods = await repo.getAllMethods();
    const classMetrics = classes.map((cls) => {
        const classMethods = methods.filter((m) => m.className === cls.name);
        return {
            nodeId: cls.id,
            name: cls.name,
            filePath: cls.filePath,
            methodCount: classMethods.length,
            betweenness: cls.betweenness ?? 0,
        };
    });
    findings.push(
        ...detectGodClasses(classMetrics, {
            methodThreshold: 10,
            betweennessThreshold: 0.3,
        }),
    );

    const fileNodes = await repo.getAllFileNodes();
    const importEdges: Array<{ sourceId: string; targetId: string }> = [];
    for (const file of fileNodes) {
        const imports = await repo.getImportsFrom(file.id);
        for (const imp of imports) {
            importEdges.push({ sourceId: imp.sourceId, targetId: imp.targetId });
        }
    }
    findings.push(...detectCircularDependencies(importEdges));

    const layersRaw = await repo.getMeta('layers');
    if (layersRaw) {
        const layerData: Array<{ layer: string; nodeIds: string[] }> = JSON.parse(layersRaw);
        const layerNodes = layerData.flatMap((entry) =>
            entry.nodeIds.map((nodeId) => ({
                nodeId,
                layer: entry.layer as Finding['kind'] extends string ? string : never,
                confidence: 1.0,
            })),
        );
        const fileImportEdges = importEdges.map((e) => ({
            sourceId: e.sourceId,
            targetId: e.targetId,
        }));
        findings.push(
            ...detectLayerViolations(
                layerNodes as Parameters<typeof detectLayerViolations>[0],
                fileImportEdges,
            ),
        );
    }

    const functions = await repo.getAllFunctions();
    const nodeMetrics = functions.map((fn) => ({
        nodeId: fn.id,
        name: fn.name,
        filePath: fn.filePath,
        pageRank: fn.pageRank ?? 0,
        betweenness: fn.betweenness ?? 0,
        lineCount: fn.lineEnd - fn.lineStart + 1,
    }));
    findings.push(
        ...detectComplexityHotspots(nodeMetrics, {
            topN: 10,
            minScore: 0.3,
        }),
    );

    return findings;
}

export async function saveTemporalSnapshot(
    repo: CortexRepository,
    commitHash: string,
): Promise<void> {
    const stats = await repo.getStats();

    const nodeCounts: Record<string, number> = {
        files: stats.files,
        functions: stats.functions,
        classes: stats.classes,
        methods: stats.methods,
        interfaces: stats.interfaces,
        types: stats.types,
        variables: stats.variables,
        modules: stats.modules,
    };

    const edgeCounts: Record<string, number> = {
        calls: stats.calls,
        imports: stats.imports,
        extends: stats.extends,
        implements: stats.implements,
        contains: stats.contains,
        flowsTo: stats.flowsTo,
        reads: stats.reads,
        writes: stats.writes,
        returns: stats.returns,
    };

    const functions = await repo.getAllFunctions();
    const topPagerank = functions
        .filter((fn) => fn.pageRank !== null && fn.pageRank > 0)
        .sort((a, b) => (b.pageRank ?? 0) - (a.pageRank ?? 0))
        .slice(0, 10)
        .map((fn) => ({ nodeId: fn.id, score: fn.pageRank ?? 0 }));

    const nodeMetrics = functions.map((fn) => ({
        nodeId: fn.id,
        name: fn.name,
        filePath: fn.filePath,
        pageRank: fn.pageRank ?? 0,
        betweenness: fn.betweenness ?? 0,
        lineCount: fn.lineEnd - fn.lineStart + 1,
    }));
    const hotspotFindings = detectComplexityHotspots(nodeMetrics, {
        topN: 10,
        minScore: 0.1,
    });
    const hotspotRankings = hotspotFindings.map((f) => ({
        nodeId: f.nodeIds[0],
        score: (f.metadata.score as number) ?? 0,
    }));

    const communityHash = computeCommunityHash(
        functions.map((fn) => ({
            id: fn.id,
            community: fn.community ?? 0,
        })),
    );

    const snapshot: TemporalSnapshot = {
        commitHash,
        timestamp: new Date(),
        nodeCounts,
        edgeCounts,
        communityHash,
        topPagerank,
        hotspotRankings,
    };

    await repo.insertTemporalSnapshot(snapshot);
}

function computeCommunityHash(nodes: Array<{ id: string; community: number }>): string {
    const sorted = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    const input = sorted.map((n) => `${n.id}:${n.community}`).join('|');
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input.charCodeAt(i);
        hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36);
}

function getCommitHash(rootDir: string): string {
    try {
        return execSync('git rev-parse HEAD', { cwd: rootDir }).toString().trim();
    } catch {
        return 'unknown';
    }
}

export async function runStage7(
    repo: CortexRepository,
    rootDir: string,
    options?: { force?: boolean; targetFiles?: string[] },
): Promise<StageResult> {
    const start = Date.now();
    const errors: StageError[] = [];

    const maxDepth = await repo.getMaxDepthLevel();
    if (maxDepth < 6 && !options?.force) {
        return {
            stage: 7,
            filesProcessed: 0,
            nodesCreated: 0,
            edgesCreated: 0,
            durationMs: Date.now() - start,
            errors: [],
        };
    }

    const findings = await collectFindings(repo);
    await repo.setMeta('findings', JSON.stringify(findings));

    const commitHash = getCommitHash(rootDir);
    await saveTemporalSnapshot(repo, commitHash);

    const allFiles = await repo.getAllFileNodes();
    const filesToUpdate = allFiles.filter((f) => f.depthLevel >= 6 || options?.force);
    for (const file of filesToUpdate) {
        await repo.upsertFileNode({ ...file, depthLevel: 7 });
    }

    return {
        stage: 7,
        filesProcessed: filesToUpdate.length,
        nodesCreated: 0,
        edgesCreated: 0,
        durationMs: Date.now() - start,
        errors,
    };
}

export function detectStyleDeviations(
    dnaEntries: DnaEntry[],
    nodePatterns: NodePattern[],
): Finding[] {
    const activeStyleEntries = dnaEntries.filter(
        (e) => e.frontmatter.status !== 'rejected' && e.frontmatter.category === 'style',
    );

    if (activeStyleEntries.length === 0) return [];

    const findings: Finding[] = [];
    const hasAsyncAwaitRule = activeStyleEntries.some(
        (e) =>
            e.content.toLowerCase().includes('async/await') ||
            e.content.toLowerCase().includes('async await'),
    );

    if (hasAsyncAwaitRule) {
        for (const node of nodePatterns) {
            if (node.usesPromiseChains && !node.usesAsyncAwait) {
                findings.push({
                    kind: 'style_deviation',
                    severity: 'info',
                    message: `${node.nodeId} uses promise chains instead of async/await`,
                    nodeIds: [node.nodeId],
                    filePaths: [node.filePath],
                    metadata: {
                        dnaRule: 'async/await preference',
                        usesPromiseChains: true,
                        usesAsyncAwait: false,
                    },
                });
            }
        }
    }

    return findings;
}

export function detectDecisionContradictions(
    dnaEntries: DnaEntry[],
    observedPatterns: ObservedPattern[],
): Finding[] {
    const activeDecisions = dnaEntries.filter(
        (e) => e.frontmatter.status === 'approved' && e.frontmatter.category === 'decisions',
    );

    if (activeDecisions.length === 0) return [];

    const findings: Finding[] = [];

    for (const pattern of observedPatterns) {
        for (const decision of activeDecisions) {
            const content = decision.content.toLowerCase();
            const patternDesc = pattern.description.toLowerCase();
            const patternName = pattern.pattern.toLowerCase().replace(/_/g, ' ');

            const isContradiction =
                (content.includes('repository pattern') && patternName.includes('direct db')) ||
                (content.includes('repository') && patternDesc.includes('directly calls database'));

            if (isContradiction) {
                findings.push({
                    kind: 'decision_contradiction',
                    severity: 'warning',
                    message: `${pattern.nodeId} contradicts decision: ${decision.content}`,
                    nodeIds: [pattern.nodeId],
                    filePaths: [pattern.filePath],
                    metadata: {
                        decisionId: decision.frontmatter.id,
                        decisionContent: decision.content,
                        observedPattern: pattern.pattern,
                    },
                });
            }
        }
    }

    return findings;
}

export function predictImpact(
    changeHistory: ChangeRecord[],
    currentFile: string,
    options: PredictImpactOptions,
): Finding[] {
    const coOccurrences = new Map<string, number>();

    for (const record of changeHistory) {
        if (record.file !== currentFile) continue;
        for (const coFile of record.changedWith) {
            coOccurrences.set(coFile, (coOccurrences.get(coFile) ?? 0) + 1);
        }
    }

    const predictedFiles: string[] = [];
    for (const [file, count] of coOccurrences) {
        if (count >= options.minCoOccurrence) {
            predictedFiles.push(file);
        }
    }

    if (predictedFiles.length === 0) return [];

    return [
        {
            kind: 'predictive_impact',
            severity: 'info',
            message: `Changes to ${currentFile} historically co-occur with: ${predictedFiles.join(', ')}`,
            nodeIds: [],
            filePaths: [currentFile, ...predictedFiles],
            metadata: {
                sourceFile: currentFile,
                coChangeFiles: predictedFiles,
                frequencies: Object.fromEntries(
                    predictedFiles.map((f) => [f, coOccurrences.get(f)!]),
                ),
            },
        },
    ];
}
