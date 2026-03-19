import type { CouplingHotspot } from './types.js';
import type { PreFetchedData } from './cycle-detector.js';

const EDGE_WEIGHTS: Record<string, number> = {
    calls: 1.0,
    extends: 1.0,
    imports: 0.5,
};

const DEFAULT_EDGE_WEIGHT = 0.7;
const MIN_THRESHOLD = 4;
const PERCENTILE = 0.9;

function edgeWeight(type: string): number {
    return EDGE_WEIGHTS[type] ?? DEFAULT_EDGE_WEIGHT;
}

function computeThreshold(weightedCounts: number[]): number {
    if (weightedCounts.length === 0) return MIN_THRESHOLD;
    const sorted = [...weightedCounts].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * PERCENTILE);
    const p90 = sorted[Math.min(idx, sorted.length - 1)];
    return Math.max(p90, MIN_THRESHOLD);
}

export class CouplingAnalyzer {
    async detect(preFetched: PreFetchedData): Promise<CouplingHotspot[]> {
        const { nodes: allNodes, edges: allEdges } = preFetched;
        if (allEdges.length === 0) return [];

        const nodeToFile = new Map<string, string>();
        for (const node of allNodes) {
            nodeToFile.set(node.id, node.filePath);
        }

        const fileIncoming = new Map<string, Set<string>>();
        const fileOutgoing = new Map<string, Set<string>>();
        const fileFanIn = new Map<string, number>();
        const fileFanOut = new Map<string, number>();

        for (const edge of allEdges) {
            if (edge.type === 'contains') continue;

            const sourceFile = nodeToFile.get(edge.sourceId);
            const targetFile = nodeToFile.get(edge.targetId);

            if (!sourceFile || !targetFile || sourceFile === targetFile) {
                continue;
            }

            const w = edgeWeight(edge.type);

            if (!fileOutgoing.has(sourceFile)) {
                fileOutgoing.set(sourceFile, new Set());
            }
            fileOutgoing.get(sourceFile)!.add(targetFile);
            fileFanOut.set(sourceFile, (fileFanOut.get(sourceFile) ?? 0) + w);

            if (!fileIncoming.has(targetFile)) {
                fileIncoming.set(targetFile, new Set());
            }
            fileIncoming.get(targetFile)!.add(sourceFile);
            fileFanIn.set(targetFile, (fileFanIn.get(targetFile) ?? 0) + w);
        }

        const allFiles = new Set([...fileIncoming.keys(), ...fileOutgoing.keys()]);
        const weightedCounts: number[] = [];

        for (const file of allFiles) {
            const fanIn = fileFanIn.get(file) ?? 0;
            const fanOut = fileFanOut.get(file) ?? 0;
            weightedCounts.push(Math.max(fanIn, fanOut));
        }

        const threshold = computeThreshold(weightedCounts);
        const hotspots: CouplingHotspot[] = [];

        for (const file of allFiles) {
            const fanIn = fileFanIn.get(file) ?? 0;
            const fanOut = fileFanOut.get(file) ?? 0;
            const exceedsIn = fanIn >= threshold;
            const exceedsOut = fanOut >= threshold;

            if (!exceedsIn && !exceedsOut) continue;

            const incoming = fileIncoming.get(file)?.size ?? 0;
            const outgoing = fileOutgoing.get(file)?.size ?? 0;

            const coupledFiles = [
                ...(fileIncoming.get(file) ?? []),
                ...(fileOutgoing.get(file) ?? []),
            ];
            const uniqueCoupled = [...new Set(coupledFiles)];

            let kind: 'fan-in' | 'fan-out' | 'both';
            if (exceedsIn && exceedsOut) {
                kind = 'both';
            } else if (exceedsIn) {
                kind = 'fan-in';
            } else {
                kind = 'fan-out';
            }

            hotspots.push({
                filePath: file,
                incomingEdges: incoming,
                outgoingEdges: outgoing,
                totalEdges: incoming + outgoing,
                coupledFiles: uniqueCoupled,
                fanIn,
                fanOut,
                weightedCount: fanIn + fanOut,
                kind,
            });
        }

        hotspots.sort((a, b) => b.totalEdges - a.totalEdges);

        return hotspots;
    }
}
