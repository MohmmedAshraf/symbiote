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

    async getDependencies(nodeId: string): Promise<NodeRecord[]> {
        const edges = await this.repo.getDependencies(nodeId);
        const nodes: NodeRecord[] = [];
        for (const e of edges) {
            const node = await this.repo.getNodeById(e.targetId);
            if (node) nodes.push(node);
        }
        return nodes;
    }

    async getDependents(nodeId: string): Promise<NodeRecord[]> {
        const edges = await this.repo.getDependents(nodeId);
        const nodes: NodeRecord[] = [];
        for (const e of edges) {
            const node = await this.repo.getNodeById(e.sourceId);
            if (node) nodes.push(node);
        }
        return nodes;
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
