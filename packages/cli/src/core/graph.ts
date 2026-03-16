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
        const nodes: NodeRecord[] = [];
        const seen = new Set<string>();
        for (const id of nodeIds) {
            for (const e of await this.repo.getDependencies(id)) {
                if (seen.has(e.targetId)) continue;
                seen.add(e.targetId);
                const node = await this.repo.getNodeById(e.targetId);
                if (node) nodes.push(node);
            }
        }
        return nodes;
    }

    async getDependents(query: string): Promise<NodeRecord[]> {
        const nodeIds = await this.resolveNodeIds(query);
        const nodes: NodeRecord[] = [];
        const seen = new Set<string>();
        for (const id of nodeIds) {
            for (const e of await this.repo.getDependents(id)) {
                if (seen.has(e.sourceId)) continue;
                seen.add(e.sourceId);
                const node = await this.repo.getNodeById(e.sourceId);
                if (node) nodes.push(node);
            }
        }
        return nodes;
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
        const dependencies: FileContext['dependencies'] = [];
        const dependents: FileContext['dependents'] = [];

        for (const node of nodes) {
            for (const edge of await this.repo.getDependencies(node.id)) {
                const target = await this.repo.getNodeById(edge.targetId);
                if (target) dependencies.push({ node: target, edge });
            }
            for (const edge of await this.repo.getDependents(node.id)) {
                const source = await this.repo.getNodeById(edge.sourceId);
                if (source) dependents.push({ node: source, edge });
            }
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
