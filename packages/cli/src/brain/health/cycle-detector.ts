import type { Repository } from '../../storage/repository.js';
import type { CircularDep } from './types.js';

export class CycleDetector {
    constructor(private repo: Repository) {}

    async detect(): Promise<CircularDep[]> {
        const allEdges = await this.repo.getAllEdges();
        if (allEdges.length === 0) return [];

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

        const dfs = async (
            nodeId: string,
            nodePath: string[]
        ): Promise<void> => {
            if (inStack.has(nodeId)) {
                const cycleStart = nodePath.indexOf(nodeId);
                if (cycleStart < 0) return;

                const chain = nodePath.slice(cycleStart);
                const filePaths = await this.resolveFilePaths(chain);

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

    private async resolveFilePaths(chain: string[]): Promise<Set<string>> {
        const filePaths = new Set<string>();
        for (const id of chain) {
            const node = await this.repo.getNodeById(id);
            if (node) filePaths.add(node.filePath);
        }
        return filePaths;
    }
}
