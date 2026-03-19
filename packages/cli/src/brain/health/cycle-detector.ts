import type { NodeRecord, EdgeRecord } from '#storage/repository.js';
import type { CircularDep } from './types.js';

export interface PreFetchedData {
    nodes: NodeRecord[];
    edges: EdgeRecord[];
}

export class CycleDetector {
    async detect(preFetched: PreFetchedData): Promise<CircularDep[]> {
        const { nodes, edges } = preFetched;
        if (edges.length === 0) return [];

        const nodeToFile = new Map<string, string>();
        for (const node of nodes) {
            nodeToFile.set(node.id, node.filePath);
        }

        const fileGraph = new Map<string, Set<string>>();
        const DEP_EDGE_TYPES = new Set(['imports', 'calls', 'extends']);
        for (const edge of edges) {
            if (!DEP_EDGE_TYPES.has(edge.type)) continue;

            const sourceFile = nodeToFile.get(edge.sourceId);
            const targetFile = nodeToFile.get(edge.targetId);
            if (!sourceFile || !targetFile || sourceFile === targetFile) continue;

            if (!fileGraph.has(sourceFile)) {
                fileGraph.set(sourceFile, new Set());
            }
            fileGraph.get(sourceFile)!.add(targetFile);
        }

        const cycles: CircularDep[] = [];
        const visited = new Set<string>();
        const inStack = new Set<string>();
        const seen = new Set<string>();

        const dfs = (file: string, path: string[]): void => {
            if (inStack.has(file)) {
                const cycleStart = path.indexOf(file);
                if (cycleStart < 0) return;

                const chain = path.slice(cycleStart);
                const key = [...chain].sort().join(',');
                if (seen.has(key)) return;
                seen.add(key);

                cycles.push({
                    chain,
                    filePaths: chain,
                });
                return;
            }

            if (visited.has(file)) return;

            visited.add(file);
            inStack.add(file);

            const neighbors = fileGraph.get(file) ?? new Set();
            path.push(file);
            for (const neighbor of neighbors) {
                dfs(neighbor, path);
            }
            path.pop();

            inStack.delete(file);
        };

        for (const file of fileGraph.keys()) {
            if (!visited.has(file)) {
                dfs(file, []);
            }
        }

        return cycles;
    }
}
