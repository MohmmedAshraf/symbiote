import type { Finding, FindingSeverity, LayerKind } from './topology-types.js';

interface ClassMetric {
    nodeId: string;
    name: string;
    filePath: string;
    methodCount: number;
    betweenness: number;
}

interface GodClassOptions {
    methodThreshold: number;
    betweennessThreshold?: number;
}

export function detectGodClasses(classMetrics: ClassMetric[], options: GodClassOptions): Finding[] {
    const findings: Finding[] = [];
    for (const cls of classMetrics) {
        if (cls.methodCount >= options.methodThreshold) {
            const severity: FindingSeverity =
                options.betweennessThreshold && cls.betweenness >= options.betweennessThreshold
                    ? 'error'
                    : 'warning';
            findings.push({
                kind: 'god_class',
                severity,
                message:
                    `${cls.name} has ${cls.methodCount} methods` +
                    ` (threshold: ${options.methodThreshold})`,
                nodeIds: [cls.nodeId],
                filePaths: [cls.filePath],
                metadata: {
                    methodCount: cls.methodCount,
                    betweenness: cls.betweenness,
                },
            });
        }
    }
    return findings;
}

interface ImportEdge {
    sourceId: string;
    targetId: string;
}

export function detectCircularDependencies(importEdges: ImportEdge[]): Finding[] {
    const adj = new Map<string, string[]>();
    const allNodes = new Set<string>();
    for (const edge of importEdges) {
        allNodes.add(edge.sourceId);
        allNodes.add(edge.targetId);
        if (!adj.has(edge.sourceId)) adj.set(edge.sourceId, []);
        adj.get(edge.sourceId)!.push(edge.targetId);
    }

    let index = 0;
    const indices = new Map<string, number>();
    const lowlinks = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];

    function strongconnect(v: string): void {
        indices.set(v, index);
        lowlinks.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);

        for (const w of adj.get(v) ?? []) {
            if (!indices.has(w)) {
                strongconnect(w);
                lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
            } else if (onStack.has(w)) {
                lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
            }
        }

        if (lowlinks.get(v) === indices.get(v)) {
            const scc: string[] = [];
            let w: string;
            do {
                w = stack.pop()!;
                onStack.delete(w);
                scc.push(w);
            } while (w !== v);
            if (scc.length > 1) {
                sccs.push(scc);
            }
        }
    }

    for (const node of allNodes) {
        if (!indices.has(node)) {
            strongconnect(node);
        }
    }

    return sccs.map((scc) => ({
        kind: 'circular_dependency' as const,
        severity: 'warning' as FindingSeverity,
        message: `Circular dependency among ${scc.length} files: ${scc.join(' \u2192 ')}`,
        nodeIds: scc,
        filePaths: scc.map((id) => id.replace(/^file:/, '')),
        metadata: { cycleLength: scc.length },
    }));
}

interface LayerNode {
    nodeId: string;
    layer: LayerKind;
    confidence: number;
}

const LAYER_ORDER: Record<string, number> = {
    controller: 0,
    service: 1,
    repository: 2,
    database: 3,
    utility: -1,
    unknown: -1,
};

export function detectLayerViolations(layers: LayerNode[], edges: ImportEdge[]): Finding[] {
    const layerMap = new Map<string, LayerKind>();
    for (const l of layers) {
        layerMap.set(l.nodeId, l.layer);
    }

    const findings: Finding[] = [];
    for (const edge of edges) {
        const srcLayer = layerMap.get(edge.sourceId);
        const tgtLayer = layerMap.get(edge.targetId);
        if (!srcLayer || !tgtLayer) continue;
        if (srcLayer === 'utility' || srcLayer === 'unknown') continue;
        if (tgtLayer === 'utility' || tgtLayer === 'unknown') continue;

        const srcOrder = LAYER_ORDER[srcLayer];
        const tgtOrder = LAYER_ORDER[tgtLayer];

        if (srcOrder > tgtOrder) {
            findings.push({
                kind: 'dependency_direction',
                severity: 'warning',
                message: `${srcLayer} layer depends on ${tgtLayer} layer` + ' (upward dependency)',
                nodeIds: [edge.sourceId, edge.targetId],
                filePaths: [
                    edge.sourceId.replace(/^file:/, ''),
                    edge.targetId.replace(/^file:/, ''),
                ],
                metadata: { fromLayer: srcLayer, toLayer: tgtLayer },
            });
            continue;
        }

        if (tgtOrder - srcOrder > 1) {
            findings.push({
                kind: 'layer_violation',
                severity: 'warning',
                message: `${srcLayer} layer skips to ${tgtLayer} layer directly`,
                nodeIds: [edge.sourceId, edge.targetId],
                filePaths: [
                    edge.sourceId.replace(/^file:/, ''),
                    edge.targetId.replace(/^file:/, ''),
                ],
                metadata: {
                    fromLayer: srcLayer,
                    toLayer: tgtLayer,
                    skippedLayers: tgtOrder - srcOrder - 1,
                },
            });
        }
    }
    return findings;
}

interface ReExportChain {
    symbolName: string;
    chain: string[];
}

export function detectBarrelAbuse(
    reExportChains: ReExportChain[],
    options: { maxHops: number },
): Finding[] {
    const findings: Finding[] = [];
    for (const chain of reExportChains) {
        const hops = chain.chain.length - 1;
        if (hops > options.maxHops) {
            findings.push({
                kind: 'barrel_abuse',
                severity: 'info',
                message:
                    `Symbol '${chain.symbolName}' re-exported through` +
                    ` ${hops} hops (max: ${options.maxHops})`,
                nodeIds: [],
                filePaths: chain.chain,
                metadata: { symbolName: chain.symbolName, hops },
            });
        }
    }
    return findings;
}

interface NodeMetric {
    nodeId: string;
    name: string;
    filePath: string;
    pageRank: number;
    betweenness: number;
    lineCount: number;
}

export function detectComplexityHotspots(
    nodeMetrics: NodeMetric[],
    options: { topN: number; minScore: number },
): Finding[] {
    if (nodeMetrics.length === 0) return [];

    const maxPR = Math.max(...nodeMetrics.map((n) => n.pageRank));
    const maxBW = Math.max(...nodeMetrics.map((n) => n.betweenness));
    const maxLC = Math.max(...nodeMetrics.map((n) => n.lineCount));

    const scored = nodeMetrics.map((n) => {
        const normPR = maxPR > 0 ? n.pageRank / maxPR : 0;
        const normBW = maxBW > 0 ? n.betweenness / maxBW : 0;
        const normLC = maxLC > 0 ? n.lineCount / maxLC : 0;
        const score = 0.4 * normPR + 0.3 * normBW + 0.3 * normLC;
        return { ...n, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const findings: Finding[] = [];
    for (let i = 0; i < Math.min(options.topN, scored.length); i++) {
        const node = scored[i];
        if (node.score < options.minScore) break;
        findings.push({
            kind: 'complexity_hotspot',
            severity: 'info',
            message: `${node.name} is a complexity hotspot` + ` (score: ${node.score.toFixed(2)})`,
            nodeIds: [node.nodeId],
            filePaths: [node.filePath],
            metadata: {
                score: node.score,
                pageRank: node.pageRank,
                betweenness: node.betweenness,
                lineCount: node.lineCount,
            },
        });
    }
    return findings;
}

interface CallPattern {
    nodeId: string;
    name: string;
    filePath: string;
    callsByTarget: Record<string, number>;
}

export function detectFeatureEnvy(
    callPatterns: CallPattern[],
    options: { ratio: number },
): Finding[] {
    const findings: Finding[] = [];
    for (const fn of callPatterns) {
        const ownFile = fn.filePath;
        const ownCalls = fn.callsByTarget[ownFile] ?? 0;

        for (const [targetFile, count] of Object.entries(fn.callsByTarget)) {
            if (targetFile === ownFile) continue;
            if (ownCalls === 0 || count / ownCalls >= options.ratio) {
                findings.push({
                    kind: 'feature_envy',
                    severity: 'info',
                    message:
                        `${fn.name} calls ${targetFile} ${count} times` +
                        ` vs own module ${ownCalls} times`,
                    nodeIds: [fn.nodeId],
                    filePaths: [fn.filePath, targetFile],
                    metadata: {
                        ownCalls,
                        externalCalls: count,
                        targetFile,
                        ratio: ownCalls > 0 ? count / ownCalls : Infinity,
                    },
                });
            }
        }
    }
    return findings;
}

interface DependencySpan {
    nodeId: string;
    name: string;
    filePath: string;
    dependentFiles: string[];
}

export function detectShotgunSurgery(
    dependencySpans: DependencySpan[],
    options: { fileThreshold: number },
): Finding[] {
    const findings: Finding[] = [];
    for (const node of dependencySpans) {
        if (node.dependentFiles.length >= options.fileThreshold) {
            findings.push({
                kind: 'shotgun_surgery',
                severity: 'warning',
                message:
                    `${node.name} has ${node.dependentFiles.length}` +
                    ` dependent files (threshold: ${options.fileThreshold})`,
                nodeIds: [node.nodeId],
                filePaths: [node.filePath, ...node.dependentFiles],
                metadata: {
                    dependentCount: node.dependentFiles.length,
                    dependentFiles: node.dependentFiles,
                },
            });
        }
    }
    return findings;
}
