#!/usr/bin/env node

import { Command } from 'commander';

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
        console.log('synapse init — not yet implemented');
    });

program
    .command('scan')
    .description('Scan the codebase and rebuild the project graph')
    .option('-f, --force', 'Force full rescan (ignore file hashes)')
    .action(async () => {
        console.log('synapse scan — not yet implemented');
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

program.parse();
