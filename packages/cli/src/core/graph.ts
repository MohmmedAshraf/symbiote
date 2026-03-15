import type {
    Repository,
    NodeRecord,
    EdgeRecord,
} from '../storage/repository.js';

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

    getDependencies(nodeId: string): NodeRecord[] {
        const edges = this.repo.getDependencies(nodeId);
        return edges
            .map((e) => this.repo.getNodeById(e.targetId))
            .filter((n): n is NodeRecord => n !== undefined);
    }

    getDependents(nodeId: string): NodeRecord[] {
        const edges = this.repo.getDependents(nodeId);
        return edges
            .map((e) => this.repo.getNodeById(e.sourceId))
            .filter((n): n is NodeRecord => n !== undefined);
    }

    searchNodes(query: string): NodeRecord[] {
        return this.repo.searchNodesByName(query);
    }

    getFileContext(filePath: string): FileContext {
        const nodes = this.repo.getNodesByFile(filePath);
        const dependencies: FileContext['dependencies'] = [];
        const dependents: FileContext['dependents'] = [];

        for (const node of nodes) {
            for (const edge of this.repo.getDependencies(node.id)) {
                const target = this.repo.getNodeById(edge.targetId);
                if (target) dependencies.push({ node: target, edge });
            }
            for (const edge of this.repo.getDependents(node.id)) {
                const source = this.repo.getNodeById(edge.sourceId);
                if (source) dependents.push({ node: source, edge });
            }
        }

        return { filePath, nodes, dependencies, dependents };
    }

    getOverview(): ProjectOverview {
        const stats = this.repo.getStats();
        const nodesByType = this.repo.getNodeCountByType();
        return {
            totalNodes: stats.nodes,
            totalEdges: stats.edges,
            totalFiles: stats.files,
            nodesByType,
            filesByLanguage: {},
        };
    }
}
