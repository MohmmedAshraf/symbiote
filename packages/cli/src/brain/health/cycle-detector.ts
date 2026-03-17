import type { Repository, NodeRecord, EdgeRecord } from '../../storage/repository.js';
import type { CircularDep } from './types.js';

export interface PreFetchedData {
    nodes: NodeRecord[];
    edges: EdgeRecord[];
}

export class CycleDetector {
    constructor(private repo: Repository) {}

    async detect(preFetched?: PreFetchedData): Promise<CircularDep[]> {
        const allEdges = preFetched?.edges ?? (await this.repo.getAllEdges());
        if (allEdges.length === 0) return [];

        const nodeMap = preFetched ? new Map(preFetched.nodes.map((n) => [n.id, n])) : undefined;

        const adjacency = new Map<string, string[]>();
        for (const edge of allEdges) {
            if (edge.sourceId === edge.targetId) continue;
            if (!adjacency.has(edge.sourceId)) {
                adjacency.set(edge.sourceId, []);
            }
            adjacency.get(edge.sourceId)!.push(edge.targetId);
        }

        const cycles: CircularDep[] = [];
        const visited = new Set<string>();
        const inStack = new Set<string>();
        const seen = new Set<string>();

        const resolveFilePaths = async (chain: string[]): Promise<Set<string>> => {
            const filePaths = new Set<string>();
            for (const id of chain) {
                if (nodeMap) {
                    const node = nodeMap.get(id);
                    if (node) filePaths.add(node.filePath);
                } else {
                    const node = await this.repo.getNodeById(id);
                    if (node) filePaths.add(node.filePath);
                }
            }
            return filePaths;
        };

        const dfs = async (nodeId: string, nodePath: string[]): Promise<void> => {
            if (inStack.has(nodeId)) {
                const cycleStart = nodePath.indexOf(nodeId);
                if (cycleStart < 0) return;

                const chain = nodePath.slice(cycleStart);
                const filePaths = await resolveFilePaths(chain);

                if (filePaths.size <= 1) return;

                const key = [...chain].sort().join(',');
                if (seen.has(key)) return;
                seen.add(key);

                cycles.push({
                    chain,
                    filePaths: [...filePaths],
                });
                return;
            }

            if (visited.has(nodeId)) return;

            visited.add(nodeId);
            inStack.add(nodeId);

            const neighbors = adjacency.get(nodeId) ?? [];
            for (const neighbor of neighbors) {
                await dfs(neighbor, [...nodePath, nodeId]);
            }

            inStack.delete(nodeId);
        };

        for (const nodeId of adjacency.keys()) {
            if (!visited.has(nodeId)) {
                await dfs(nodeId, []);
            }
        }

        return cycles;
    }
}
