import type { Repository, NodeRecord } from '../storage/repository.js';
import type { IntentStore } from './intent.js';

export interface HealthViolation {
    constraintId: string;
    description: string;
    scope: string;
}

export interface CircularDep {
    nodeIds: string[];
    filePaths: string[];
}

export interface HealthReport {
    score: number;
    orphanFiles: string[];
    circularDeps: CircularDep[];
    constraintViolations: HealthViolation[];
    deadCode: NodeRecord[];
}

const WEIGHT_CONSTRAINTS = 0.4;
const WEIGHT_CIRCULAR = 0.2;
const WEIGHT_DEAD_CODE = 0.2;
const WEIGHT_COUPLING = 0.2;

export class HealthAnalyzer {
    constructor(
        private repo: Repository,
        private intent: IntentStore
    ) {}

    analyze(): HealthReport {
        const orphanFiles = this.findOrphanFiles();
        const circularDeps = this.findCircularDeps();
        const constraintViolations = this.checkConstraints();
        const deadCode = this.findDeadCode();

        const score = this.computeScore(
            orphanFiles,
            circularDeps,
            constraintViolations,
            deadCode
        );

        return {
            score,
            orphanFiles,
            circularDeps,
            constraintViolations,
            deadCode,
        };
    }

    private findOrphanFiles(): string[] {
        const stats = this.repo.getStats();
        if (stats.nodes === 0) return [];

        const allFiles = new Set<string>();
        const importedFiles = new Set<string>();

        const allNodes = this.repo.getAllNodes();
        for (const node of allNodes) {
            allFiles.add(node.filePath);
        }

        const allEdges = this.repo.getAllEdges();
        for (const edge of allEdges) {
            if (edge.type === 'imports') {
                const match = edge.targetId.match(/^file:(.+)$/);
                if (match) importedFiles.add(match[1]);
            }
        }

        const orphans: string[] = [];
        for (const file of allFiles) {
            const hasIncoming = allEdges.some((e) => {
                const targetNode = this.repo.getNodeById(e.targetId);
                return (
                    targetNode &&
                    targetNode.filePath === file &&
                    e.sourceId !== e.targetId
                );
            });

            const isImported = importedFiles.has(file);

            if (!hasIncoming && !isImported) {
                orphans.push(file);
            }
        }

        return orphans;
    }

    private findCircularDeps(): CircularDep[] {
        const cycles: CircularDep[] = [];
        const allEdges = this.repo.getAllEdges();

        const adjacency = new Map<string, string[]>();
        for (const edge of allEdges) {
            if (!adjacency.has(edge.sourceId)) {
                adjacency.set(edge.sourceId, []);
            }
            adjacency.get(edge.sourceId)!.push(edge.targetId);
        }

        const visited = new Set<string>();
        const inStack = new Set<string>();

        const dfs = (nodeId: string, nodePath: string[]): void => {
            if (inStack.has(nodeId)) {
                const cycleStart = nodePath.indexOf(nodeId);
                if (cycleStart >= 0) {
                    const cycleIds = nodePath.slice(cycleStart);
                    const filePaths = [
                        ...new Set(
                            cycleIds
                                .map((id) =>
                                    this.repo.getNodeById(id)
                                )
                                .filter(
                                    (n): n is NodeRecord =>
                                        n !== undefined
                                )
                                .map((n) => n.filePath)
                        ),
                    ];

                    if (filePaths.length > 1) {
                        cycles.push({
                            nodeIds: cycleIds,
                            filePaths,
                        });
                    }
                }
                return;
            }

            if (visited.has(nodeId)) return;

            visited.add(nodeId);
            inStack.add(nodeId);

            const neighbors = adjacency.get(nodeId) ?? [];
            for (const neighbor of neighbors) {
                dfs(neighbor, [...nodePath, nodeId]);
            }

            inStack.delete(nodeId);
        };

        for (const nodeId of adjacency.keys()) {
            if (!visited.has(nodeId)) {
                dfs(nodeId, []);
            }
        }

        return cycles;
    }

    private checkConstraints(): HealthViolation[] {
        const constraints = this.intent.listEntries('constraint', {
            status: 'active',
        });
        return constraints.map((c) => ({
            constraintId: c.frontmatter.id,
            description: c.content,
            scope: c.frontmatter.scope,
        }));
    }

    private findDeadCode(): NodeRecord[] {
        const allNodes = this.repo.getAllNodes();
        const allEdges = this.repo.getAllEdges();
        const referencedIds = new Set<string>();

        for (const edge of allEdges) {
            referencedIds.add(edge.targetId);
        }

        return allNodes.filter(
            (node) =>
                (node.type === 'function' || node.type === 'method') &&
                !referencedIds.has(node.id)
        );
    }

    private computeScore(
        orphanFiles: string[],
        circularDeps: CircularDep[],
        constraintViolations: HealthViolation[],
        deadCode: NodeRecord[]
    ): number {
        const constraintScore =
            constraintViolations.length === 0
                ? 100
                : Math.max(
                      0,
                      100 - constraintViolations.length * 20
                  );
        const circularScore =
            circularDeps.length === 0
                ? 100
                : Math.max(0, 100 - circularDeps.length * 25);
        const deadCodeScore =
            deadCode.length === 0
                ? 100
                : Math.max(0, 100 - deadCode.length * 5);
        const couplingScore =
            orphanFiles.length === 0
                ? 100
                : Math.max(0, 100 - orphanFiles.length * 10);

        return Math.round(
            constraintScore * WEIGHT_CONSTRAINTS +
                circularScore * WEIGHT_CIRCULAR +
                deadCodeScore * WEIGHT_DEAD_CODE +
                couplingScore * WEIGHT_COUPLING
        );
    }
}
