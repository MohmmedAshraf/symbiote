import type { AttentionSet } from '#hooks/attention.js';
import type { GraphInstance } from '#core/types.js';

export interface LobeMetrics {
    community: number;
    readCoverage: number;
    editIntensity: number;
}

export interface BrainMetrics {
    awareness: {
        value: number;
        readNodes: number;
        totalNodes: number;
        blindSpots: number;
    };
    lobes: LobeMetrics[];
    pulse: {
        value: number;
        riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    };
    ripples: {
        totalAffected: number;
        criticalPaths: number;
    };
    events: {
        total: number;
        reads: number;
        edits: number;
        creates: number;
        discoveries: number;
    };
}

export class BrainMetricsEngine {
    private graph: GraphInstance;
    private attention: AttentionSet;
    private eventCounts = { total: 0, reads: 0, edits: 0, creates: 0 };

    constructor(graph: GraphInstance, attention: AttentionSet) {
        this.graph = graph;
        this.attention = attention;
    }

    recordEvent(type: string): void {
        this.eventCounts.total++;
        if (type === 'file:read') this.eventCounts.reads++;
        else if (type === 'file:edit') this.eventCounts.edits++;
        else if (type === 'file:create') this.eventCounts.creates++;
    }

    compute(): BrainMetrics {
        const totalNodes = this.graph.order;
        const readFiles = new Set(this.attention.allFiles());
        const editedFiles = new Set(this.attention.editedFiles());

        const readNodeIds = this.collectNodesForFiles(readFiles);
        const editedNodeIds = this.collectNodesForFiles(editedFiles);
        const blindSpots = this.countBlindSpots(editedNodeIds, readNodeIds);

        const awareness = totalNodes > 0 ? readNodeIds.size / totalNodes : 0;

        const lobes = this.computeLobeMetrics(readNodeIds, editedNodeIds);
        const pulse = this.computePulse(editedNodeIds);
        const ripples = this.computeRipples(editedNodeIds);

        return {
            awareness: {
                value: awareness,
                readNodes: readNodeIds.size,
                totalNodes,
                blindSpots,
            },
            lobes,
            pulse,
            ripples,
            events: {
                ...this.eventCounts,
                discoveries: this.attention.getDiscoveries(),
            },
        };
    }

    private collectNodesForFiles(files: Set<string>): Set<string> {
        const nodes = new Set<string>();
        for (const fp of files) {
            const fileNodeId = `file:${fp}`;
            if (!this.graph.hasNode(fileNodeId)) continue;
            nodes.add(fileNodeId);
            this.graph.forEachOutEdge(
                fileNodeId,
                (
                    _edge: string,
                    attrs: Record<string, unknown>,
                    _source: string,
                    target: string,
                ) => {
                    if (attrs.type === 'contains') {
                        nodes.add(target);
                    }
                },
            );
        }
        return nodes;
    }

    private countBlindSpots(editedNodes: Set<string>, readNodes: Set<string>): number {
        let count = 0;
        for (const nodeId of editedNodes) {
            if (!this.graph.hasNode(nodeId)) continue;
            this.graph.forEachOutEdge(
                nodeId,
                (
                    _edge: string,
                    attrs: Record<string, unknown>,
                    _source: string,
                    target: string,
                ) => {
                    if (attrs.type !== 'contains' && !readNodes.has(target)) {
                        count++;
                    }
                },
            );
        }
        return count;
    }

    private computeLobeMetrics(readNodes: Set<string>, editedNodes: Set<string>): LobeMetrics[] {
        const communityTotals = new Map<number, number>();
        const communityReads = new Map<number, number>();
        const communityEdits = new Map<number, number>();

        this.graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
            const community = attrs.community as number | undefined;
            if (community === undefined) return;

            communityTotals.set(community, (communityTotals.get(community) ?? 0) + 1);
            if (readNodes.has(nodeId)) {
                communityReads.set(community, (communityReads.get(community) ?? 0) + 1);
            }
            if (editedNodes.has(nodeId)) {
                communityEdits.set(community, (communityEdits.get(community) ?? 0) + 1);
            }
        });

        const lobes: LobeMetrics[] = [];
        for (const [community, total] of communityTotals) {
            const reads = communityReads.get(community) ?? 0;
            const edits = communityEdits.get(community) ?? 0;
            lobes.push({
                community,
                readCoverage: total > 0 ? reads / total : 0,
                editIntensity: total > 0 ? edits / total : 0,
            });
        }

        lobes.sort((a, b) => a.community - b.community);
        return lobes;
    }

    private computePulse(editedNodes: Set<string>): {
        value: number;
        riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    } {
        if (editedNodes.size === 0) {
            return { value: 0, riskLevel: 'LOW' };
        }

        let maxPageRank = 0;
        for (const nodeId of editedNodes) {
            if (!this.graph.hasNode(nodeId)) continue;
            const pr = (this.graph.getNodeAttribute(nodeId, 'pagerank') as number | undefined) ?? 0;
            if (pr > maxPageRank) maxPageRank = pr;
        }

        const riskLevel = maxPageRank > 0.01 ? 'HIGH' : maxPageRank > 0.005 ? 'MEDIUM' : 'LOW';

        return { value: maxPageRank, riskLevel };
    }

    private computeRipples(editedNodes: Set<string>): {
        totalAffected: number;
        criticalPaths: number;
    } {
        const affected = new Set<string>();
        let criticalPaths = 0;

        for (const nodeId of editedNodes) {
            if (!this.graph.hasNode(nodeId)) continue;
            this.graph.forEachInEdge(
                nodeId,
                (_edge: string, attrs: Record<string, unknown>, source: string) => {
                    if (editedNodes.has(source)) return;
                    affected.add(source);
                    const edgeType = attrs.type as string;
                    if (edgeType === 'calls' || edgeType === 'imports') {
                        criticalPaths++;
                    }
                },
            );
        }

        return { totalAffected: affected.size, criticalPaths };
    }
}
