import * as p from '@clack/prompts';
import pc from 'picocolors';
import { ensureBrainDir, getBrainDbPath } from '#utils/config.js';
import { createDatabaseWithRetry } from './shared.js';
import { CortexRepository } from '#cortex/repository.js';
import { CortexEngine } from '#cortex/engine.js';
import { createCortexSchema, refreshSymbolsTable } from '#cortex/schema.js';

export async function cmdScan(flags: Record<string, string | boolean>): Promise<void> {
    const projectRoot = process.cwd();
    ensureBrainDir(projectRoot);
    const dbPath = getBrainDbPath(projectRoot);
    const db = await createDatabaseWithRetry(dbPath);

    await createCortexSchema(db);

    const cortexRepo = new CortexRepository(db);
    const engine = new CortexEngine(cortexRepo);

    const s = p.spinner();
    s.start('Scanning codebase (cortex pipeline)...');
    const result = await engine.run({
        rootDir: projectRoot,
        force: flags.force === true,
    });

    await refreshSymbolsTable(db);
    await db.close();

    const stageNames = [
        'Structure',
        'Symbols',
        'Resolution',
        'Call Graph',
        'Type Inference',
        'Flow Analysis',
        'Topology',
        'Intelligence',
    ];
    const completedStages = result.stages
        .map((st, i) =>
            st.filesProcessed > 0 || st.nodesCreated > 0 || st.edgesCreated > 0
                ? stageNames[i]
                : null,
        )
        .filter(Boolean);

    s.stop(
        `Depth ${result.maxDepth + 1}/8` +
            pc.dim(
                ` · ${result.totalFiles} files · ${result.totalNodes} nodes · ${result.totalEdges} edges` +
                    ` · ${Math.round(result.totalDurationMs / 1000)}s`,
            ),
    );

    if (completedStages.length > 0) {
        p.log.info(pc.dim(`Stages: ${completedStages.join(' → ')}`));
    }
}
