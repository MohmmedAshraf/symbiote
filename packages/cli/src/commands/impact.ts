import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getBrainDbPath } from '../utils/config.js';
import { createDatabaseWithRetry } from './shared.js';

export async function cmdImpact(): Promise<void> {
    const projectRoot = process.cwd();
    const dbPath = getBrainDbPath(projectRoot);
    const db = await createDatabaseWithRetry(dbPath);

    p.intro(pc.bold('Symbiote') + pc.dim(' — Impact Analysis'));

    const s = p.spinner();
    s.start('Loading graph...');

    const { buildGraphFromDb } = await import('../core/graph-builder.js');
    const graph = await buildGraphFromDb(db);

    s.stop('Graph loaded');

    const s2 = p.spinner();
    s2.start('Analyzing working changes...');

    const { GitImpactAnalyzer } = await import('../core/git-impact.js');
    const gitImpact = new GitImpactAnalyzer(graph);
    let result;
    try {
        result = await gitImpact.analyzeWorkingChanges(projectRoot);
    } catch {
        s2.stop('No git changes detected');
        await db.close();
        p.outro('Working tree is clean.');
        return;
    }

    s2.stop('Analysis complete');
    await db.close();

    if (result.changedFiles.length === 0) {
        p.outro('Working tree is clean.');
        return;
    }

    p.log.info(
        `${pc.dim('Changed files:')}  ${result.changedFiles.length}\n` +
            `${pc.dim('Affected nodes:')} ${result.affectedNodes.length}\n` +
            `${pc.dim('Affected files:')} ${result.affectedFiles.length}\n` +
            `${pc.dim('Risk level:')}     ${result.riskLevel === 'HIGH' ? pc.red(result.riskLevel) : result.riskLevel === 'MEDIUM' ? pc.yellow(result.riskLevel) : pc.green(result.riskLevel)}`,
    );

    if (result.affectedFiles.length > 0) {
        console.log();
        console.log(pc.bold('  Affected files:'));
        for (const file of result.affectedFiles.sort((a, b) => b.maxConfidence - a.maxConfidence)) {
            const conf = (file.maxConfidence * 100).toFixed(0);
            const color =
                file.maxConfidence > 0.7 ? pc.red : file.maxConfidence > 0.4 ? pc.yellow : pc.dim;
            console.log(
                `    ${color(`${conf}%`)} ${file.filePath} ${pc.dim(`(${file.nodes.length} symbols)`)}`,
            );
        }
    }

    p.outro(result.summary);
}
