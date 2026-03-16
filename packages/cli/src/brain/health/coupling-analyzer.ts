import type { Repository } from '../../storage/repository.js';
import type { CouplingHotspot } from './types.js';

const HOTSPOT_THRESHOLD = 8;

export class CouplingAnalyzer {
    constructor(private repo: Repository) {}

    detect(): CouplingHotspot[] {
        const allNodes = this.repo.getAllNodes();
        const allEdges = this.repo.getAllEdges();
        if (allEdges.length === 0) return [];

        const nodeToFile = new Map<string, string>();
        for (const node of allNodes) {
            nodeToFile.set(node.id, node.filePath);
        }

        const fileIncoming = new Map<string, Set<string>>();
        const fileOutgoing = new Map<string, Set<string>>();

        for (const edge of allEdges) {
            const sourceFile = nodeToFile.get(edge.sourceId);
            const targetFile = nodeToFile.get(edge.targetId);

            if (
                !sourceFile ||
                !targetFile ||
                sourceFile === targetFile
            )
                continue;

            if (!fileOutgoing.has(sourceFile))
                fileOutgoing.set(sourceFile, new Set());
            fileOutgoing.get(sourceFile)!.add(targetFile);

            if (!fileIncoming.has(targetFile))
                fileIncoming.set(targetFile, new Set());
            fileIncoming.get(targetFile)!.add(sourceFile);
        }

        const allFiles = new Set([
            ...fileIncoming.keys(),
            ...fileOutgoing.keys(),
        ]);
        const hotspots: CouplingHotspot[] = [];

        for (const file of allFiles) {
            const incoming = fileIncoming.get(file)?.size ?? 0;
            const outgoing = fileOutgoing.get(file)?.size ?? 0;
            const total = incoming + outgoing;

            if (total < HOTSPOT_THRESHOLD) continue;

            const coupledFiles = [
                ...(fileIncoming.get(file) ?? []),
                ...(fileOutgoing.get(file) ?? []),
            ];
            const uniqueCoupled = [...new Set(coupledFiles)];

            hotspots.push({
                filePath: file,
                incomingEdges: incoming,
                outgoingEdges: outgoing,
                totalEdges: total,
                coupledFiles: uniqueCoupled,
            });
        }

        hotspots.sort((a, b) => b.totalEdges - a.totalEdges);

        return hotspots;
    }
}
