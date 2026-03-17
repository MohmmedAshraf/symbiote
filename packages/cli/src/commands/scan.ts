import * as p from '@clack/prompts';
import pc from 'picocolors';
import { Repository } from '../storage/repository.js';
import { Scanner } from '../core/scanner.js';
import { getBrainDbPath } from '../utils/config.js';
import { createDatabaseWithRetry } from './shared.js';

export async function cmdScan(flags: Record<string, string | boolean>): Promise<void> {
    const projectRoot = process.cwd();
    const dbPath = getBrainDbPath(projectRoot);
    const db = await createDatabaseWithRetry(dbPath);
    const repo = new Repository(db);
    const scanner = new Scanner(repo, db);

    const s = p.spinner();
    s.start('Scanning codebase...');
    const result = await scanner.scan(projectRoot, {
        force: flags.force === true,
        embeddings: flags.embeddings !== false,
    });
    await db.close();

    const embeddingsInfo =
        result.embeddingsGenerated > 0 ? ` · Embeddings: ${result.embeddingsGenerated}` : '';
    s.stop(
        `Scanned: ${result.filesScanned}` +
            pc.dim(
                ` · Skipped: ${result.filesSkipped} · Nodes: ${result.nodesCreated} · Edges: ${result.edgesCreated}${embeddingsInfo}`,
            ),
    );
}
