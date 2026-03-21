import { CortexRepository } from './repository.js';
import { runStage0 } from './stage-0-structure.js';
import { runStage1 } from './stage-1-symbols.js';
import { runStage2 } from './stage-2-resolution.js';
import { runStage3 } from './stage-3-callgraph.js';
import { runStage4 } from './stage-4-types.js';
import { runStage5 } from './stage-5-flow.js';
import { runStage6 } from './stage-6-topology.js';
import { runStage7 } from './stage-7-intelligence.js';
import type { PipelineOptions, PipelineResult, StageResult } from './types.js';

type StageFn = (
    repo: CortexRepository,
    rootDir: string,
    options?: { force?: boolean; targetFiles?: string[] },
) => Promise<StageResult>;

const STAGES: StageFn[] = [
    runStage0,
    runStage1,
    runStage2,
    runStage3,
    runStage4,
    runStage5,
    runStage6,
    runStage7,
];

export class CortexEngine {
    constructor(private repo: CortexRepository) {}

    async run(options: PipelineOptions): Promise<PipelineResult> {
        const start = Date.now();
        const maxStage = options.maxStage ?? STAGES.length - 1;
        const stages: StageResult[] = [];
        let totalNodes = 0;
        let totalEdges = 0;

        for (let i = 0; i <= maxStage && i < STAGES.length; i++) {
            const result = await STAGES[i](this.repo, options.rootDir, {
                force: options.force,
                targetFiles: options.targetFiles,
            });
            stages.push(result);
            totalNodes += result.nodesCreated;
            totalEdges += result.edgesCreated;

            if (i === 0 && result.filesProcessed > 0) {
                await this.cascadeInvalidation(result);
            }
        }

        return {
            stages,
            totalFiles: Math.max(...stages.map((s) => s.filesProcessed), 0),
            totalNodes,
            totalEdges,
            totalDurationMs: Date.now() - start,
            maxDepth: maxStage,
        };
    }

    private async cascadeInvalidation(stage0Result: StageResult): Promise<void> {
        const changedFileIds = await this.getChangedFileIds(stage0Result);
        if (changedFileIds.length === 0) return;

        const visited = new Set<string>(changedFileIds);
        let frontier = [...changedFileIds];
        let depth = 0;
        const maxCascadeDepth = 10;

        while (frontier.length > 0 && depth < maxCascadeDepth) {
            const nextFrontier: string[] = [];
            for (const fileId of frontier) {
                const importers = await this.repo.getImportersOf(fileId);
                for (const imp of importers) {
                    if (!visited.has(imp.sourceId)) {
                        visited.add(imp.sourceId);
                        nextFrontier.push(imp.sourceId);
                    }
                }
            }
            frontier = nextFrontier;
            depth++;
        }

        for (const id of changedFileIds) {
            visited.delete(id);
        }
        const cascadedIds = [...visited];
        const fileNodes = await this.repo.getFileNodesByIds(cascadedIds);
        for (const file of fileNodes) {
            if (file.depthLevel > 1) {
                await this.repo.upsertFileNode({
                    ...file,
                    depthLevel: 1,
                });
            }
        }
    }

    private async getChangedFileIds(stage0Result: StageResult): Promise<string[]> {
        if (stage0Result.filesProcessed === 0) return [];
        const allFiles = await this.repo.getAllFileNodes();
        return allFiles.filter((f) => f.depthLevel === 0).map((f) => f.id);
    }
}
