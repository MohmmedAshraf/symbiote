import type { Repository, NodeRecord, EdgeRecord } from '../storage/repository.js';

export interface FileContext {
    filePath: string;
    nodes: NodeRecord[];
    dependencies: Array<{ node: NodeRecord; edge: EdgeRecord }>;
    dependents: Array<{ node: NodeRecord; edge: EdgeRecord }>;
}

export interface ProjectOverview {
    totalNodes: number;
    totalEdges: number;
    totalFiles: number;
    nodesByType: Record<string, number>;
    filesByLanguage: Record<string, number>;
}

export class GraphQuery {
    constructor(private repo: Repository) {}

    async getDependencies(query: string): Promise<NodeRecord[]> {
        const nodeIds = await this.resolveNodeIds(query);
        const seen = new Set<string>();
        const targetIds: string[] = [];
        for (const id of nodeIds) {
            for (const e of await this.repo.getDependencies(id)) {
                if (!seen.has(e.targetId)) {
                    seen.add(e.targetId);
                    targetIds.push(e.targetId);
                }
            }
        }
        const nodeMap = await this.repo.getNodesByIds(targetIds);
        return targetIds
            .map((id) => nodeMap.get(id))
            .filter((n): n is NodeRecord => n !== undefined);
    }

    async getDependents(query: string): Promise<NodeRecord[]> {
        const nodeIds = await this.resolveNodeIds(query);
        const seen = new Set<string>();
        const sourceIds: string[] = [];
        for (const id of nodeIds) {
            for (const e of await this.repo.getDependents(id)) {
                if (!seen.has(e.sourceId)) {
                    seen.add(e.sourceId);
                    sourceIds.push(e.sourceId);
                }
            }
        }
        const nodeMap = await this.repo.getNodesByIds(sourceIds);
        return sourceIds
            .map((id) => nodeMap.get(id))
            .filter((n): n is NodeRecord => n !== undefined);
    }

    private async resolveNodeIds(query: string): Promise<string[]> {
        const direct = await this.repo.getNodeById(query);
        if (direct) return [query];

        const fileNode = await this.repo.getNodeById(`file:${query}`);
        if (fileNode) return [`file:${query}`];

        const byFile = await this.repo.getNodesByFile(query);
        if (byFile.length > 0) return byFile.map((n) => n.id);

        const byName = await this.repo.searchNodesByName(query);
        if (byName.length > 0) return byName.slice(0, 20).map((n) => n.id);

        return [query];
    }

    async getHubs(limit: number = 20): Promise<Array<{ node: NodeRecord; edgeCount: number }>> {
        return this.repo.getHubs(limit);
    }

    async searchNodes(query: string): Promise<NodeRecord[]> {
        return this.repo.searchNodesByName(query);
    }

    async getFileContext(filePath: string): Promise<FileContext> {
        const nodes = await this.repo.getNodesByFile(filePath);
        const nodeIds = nodes.map((n) => n.id);

        const allDeps = await this.repo.getDependenciesBatch(nodeIds);
        const allDependents = await this.repo.getDependentsBatch(nodeIds);

        const targetIds = allDeps.map((e) => e.targetId);
        const sourceIds = allDependents.map((e) => e.sourceId);
        const allIds = [...new Set([...targetIds, ...sourceIds])];
        const nodeMap = await this.repo.getNodesByIds(allIds);

        const dependencies: FileContext['dependencies'] = [];
        for (const edge of allDeps) {
            const target = nodeMap.get(edge.targetId);
            if (target) dependencies.push({ node: target, edge });
        }

        const dependents: FileContext['dependents'] = [];
        for (const edge of allDependents) {
            const source = nodeMap.get(edge.sourceId);
            if (source) dependents.push({ node: source, edge });
        }

        return { filePath, nodes, dependencies, dependents };
    }

    async getOverview(): Promise<ProjectOverview> {
        const stats = await this.repo.getStats();
        const nodesByType = await this.repo.getNodeCountByType();
        return {
            totalNodes: stats.nodes,
            totalEdges: stats.edges,
            totalFiles: stats.files,
            nodesByType,
            filesByLanguage: {},
        };
    }
}
