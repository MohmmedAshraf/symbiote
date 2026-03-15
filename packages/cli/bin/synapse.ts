#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { createDatabase } from '../src/storage/db.js';
import { Repository } from '../src/storage/repository.js';
import { Scanner, type ScanResult } from '../src/core/scanner.js';
import { GraphQuery } from '../src/core/graph.js';
import {
    ensureBrainDir,
    ensureSynapseHome,
    getBrainDbPath,
} from '../src/utils/config.js';

const program = new Command();

program
    .name('synapse')
    .description(
        'AI-powered project brain — a living, queryable knowledge layer for your codebase'
    )
    .version('0.1.0');

program
    .command('init')
    .description('Initialize Synapse for the current project')
    .action(async () => {
        const projectRoot = process.cwd();
        console.log(`Initializing Synapse in ${projectRoot}...`);

        ensureSynapseHome();
        const brainDir = ensureBrainDir(projectRoot);
        console.log(`Created ${brainDir}`);

        const dbPath = getBrainDbPath(projectRoot);
        const db = createDatabase(dbPath);
        const repo = new Repository(db);
        const scanner = new Scanner(repo);

        console.log('Scanning codebase...');
        const result = await scanner.scan(projectRoot);

        generateOverview(projectRoot, brainDir, result, repo);
        db.close();

        console.log(
            `Synapse is ready. Brain: ${result.nodesCreated} nodes, ` +
                `${result.edgesCreated} edges. ` +
                `Scanned ${result.filesScanned} files.`
        );

        if (result.errors.length > 0) {
            console.log(`${result.errors.length} files had errors.`);
        }
    });

program
    .command('scan')
    .description('Scan the codebase and rebuild the project graph')
    .option('-f, --force', 'Force full rescan (ignore file hashes)')
    .action(async (options: { force?: boolean }) => {
        const projectRoot = process.cwd();
        const dbPath = getBrainDbPath(projectRoot);
        const db = createDatabase(dbPath);
        const repo = new Repository(db);
        const scanner = new Scanner(repo);

        console.log('Scanning codebase...');
        const result = await scanner.scan(projectRoot, {
            force: options.force,
        });
        db.close();

        console.log(
            `Done. Scanned: ${result.filesScanned}, ` +
                `Skipped: ${result.filesSkipped}, ` +
                `Nodes: ${result.nodesCreated}, Edges: ${result.edgesCreated}`
        );
    });

program
    .command('serve')
    .description('Start MCP server and web UI')
    .option('-p, --port <number>', 'Web UI port', '3333')
    .action(async () => {
        console.log('synapse serve — not yet implemented');
    });

program
    .command('mcp')
    .description('Start MCP server only (stdio, for editor integration)')
    .action(async () => {
        console.log('synapse mcp — not yet implemented');
    });

program
    .command('dna')
    .description('View and manage your developer DNA')
    .action(async () => {
        console.log('synapse dna — not yet implemented');
    });

program.action(async () => {
    const projectRoot = process.cwd();

    ensureSynapseHome();
    const brainDir = ensureBrainDir(projectRoot);

    const dbPath = getBrainDbPath(projectRoot);
    const db = createDatabase(dbPath);
    const repo = new Repository(db);
    const scanner = new Scanner(repo);

    console.log('Scanning codebase...');
    const result = await scanner.scan(projectRoot);

    generateOverview(projectRoot, brainDir, result, repo);

    console.log(
        `Synapse is ready. Brain: ${result.nodesCreated} nodes, ` +
            `${result.edgesCreated} edges. ` +
            `Scanned ${result.filesScanned} files.`
    );

    if (result.errors.length > 0) {
        console.log(`${result.errors.length} files had errors.`);
    }

    console.log(
        'MCP server and web UI not yet implemented. Use \'synapse scan\' for now.'
    );
    db.close();
});

program.parse();

function generateOverview(
    projectRoot: string,
    brainDir: string,
    scanResult: ScanResult,
    repo: Repository
): void {
    const graph = new GraphQuery(repo);
    const overview = graph.getOverview();
    const projectName = path.basename(projectRoot);

    const typeBreakdown = Object.entries(overview.nodesByType)
        .map(([type, count]) => `- ${type}: ${count}`)
        .join('\n');

    const content = `# ${projectName}

Auto-generated project overview by Synapse.

## Stats

- **Files scanned:** ${scanResult.filesScanned}
- **Total nodes:** ${overview.totalNodes}
- **Total edges:** ${overview.totalEdges}

## Node Types

${typeBreakdown}

---

*Edit this file to add project context, architecture notes, or anything that helps AI understand your project.*
`;

    const overviewPath = path.join(brainDir, 'intent', 'overview.md');
    if (!fs.existsSync(overviewPath)) {
        fs.writeFileSync(overviewPath, content);
    }
}
