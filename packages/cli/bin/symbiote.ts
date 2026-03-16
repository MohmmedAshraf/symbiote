#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerResponse } from 'node:http';
import { Command } from 'commander';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.map': 'application/json',
};

function serveStatic(
    webDistDir: string,
    pathname: string,
    res: ServerResponse
): boolean {
    const safePath = path
        .normalize(pathname)
        .replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(webDistDir, safePath);

    if (
        !fs.existsSync(filePath) ||
        fs.statSync(filePath).isDirectory()
    ) {
        filePath = path.join(webDistDir, 'index.html');
    }

    if (!fs.existsSync(filePath)) return false;

    const ext = path.extname(filePath);
    const contentType =
        MIME_TYPES[ext] ?? 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return true;
}
import { createDatabase } from '../src/storage/db.js';
import { Repository } from '../src/storage/repository.js';
import { Scanner, type ScanResult } from '../src/core/scanner.js';
import { GraphQuery } from '../src/core/graph.js';
import {
    ensureBrainDir,
    ensureSymbioteHome,
    getBrainDbPath,
} from '../src/utils/config.js';
import { DnaStorage } from '../src/dna/storage.js';
import { DnaEngine } from '../src/dna/engine.js';
import { createMcpServer } from '../src/mcp/server.js';
import { createServerContext } from '../src/mcp/context.js';
import { handleApiRequest } from '../src/mcp/http-api.js';

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
        const { SmartInit } = await import(
            '../src/init/index.js'
        );

        const projectRoot = process.cwd();
        console.log(`Initializing Synapse in ${projectRoot}...`);

        const symbioteHome = ensureSymbioteHome();
        const brainDir = ensureBrainDir(projectRoot);

        const dbPath = getBrainDbPath(projectRoot);
        const db = createDatabase(dbPath);
        const repo = new Repository(db);
        const scanner = new Scanner(repo);

        console.log('Scanning codebase...');
        const scanResult = await scanner.scan(projectRoot);

        console.log('Analyzing project...');
        const init = new SmartInit({
            projectRoot,
            symbioteHome,
            brainDir,
            scanResult,
        });

        const result = init.run();
        db.close();

        console.log('');
        console.log('Synapse initialized successfully.');
        console.log('');
        console.log(
            `  Brain:         ${scanResult.nodesCreated} nodes, ${scanResult.edgesCreated} edges`
        );
        console.log(
            `  Files scanned: ${scanResult.filesScanned}`
        );
        console.log(
            `  Rules imported: ${result.rulesImported}`
        );
        console.log(
            `  Intent entries: ${result.intentEntriesCreated} constraints/decisions`
        );
        console.log(
            `  DNA entries:    ${result.dnaEntriesLoaded} loaded, ${result.dnaEntriesImported} imported`
        );
        console.log(
            `  Tech stack:    ${result.techStack.map((t) => t.name).join(', ') || 'none detected'}`
        );
        console.log('');

        if (result.architectureSignals.length > 0) {
            console.log('  Architecture:');
            for (const signal of result.architectureSignals.slice(
                0,
                5
            )) {
                console.log(`    - ${signal.pattern}`);
            }
            console.log('');
        }

        if (scanResult.errors.length > 0) {
            console.log(
                `  ${scanResult.errors.length} files had parse errors.`
            );
        }

        console.log(
            "Run 'synapse serve' to start the MCP server and web UI."
        );
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
    .option('-p, --port <number>', 'HTTP port', '3333')
    .action(async (options: { port: string }) => {
        const { SSEServerTransport } = await import(
            '@modelcontextprotocol/sdk/server/sse.js'
        );
        const http = await import('node:http');

        const projectRoot = process.cwd();
        const brainDir = ensureBrainDir(projectRoot);
        const symbioteHome = ensureSymbioteHome();
        const dbPath = getBrainDbPath(projectRoot);
        const db = createDatabase(dbPath);

        const ctx = createServerContext({
            db,
            brainDir,
            symbioteHome,
        });
        const { server } = createMcpServer(ctx);

        const port = parseInt(options.port, 10);
        const transports = new Map<
            string,
            InstanceType<typeof SSEServerTransport>
        >();

        const httpServer = http.createServer(async (req, res) => {
            const url = new URL(
                req.url ?? '/',
                `http://localhost:${port}`
            );

            if (url.pathname === '/sse' && req.method === 'GET') {
                const transport = new SSEServerTransport(
                    '/messages',
                    res
                );
                transports.set(transport.sessionId, transport);
                await server.connect(transport);
                return;
            }

            if (
                url.pathname === '/messages' &&
                req.method === 'POST'
            ) {
                const sessionId =
                    url.searchParams.get('sessionId');
                const transport = sessionId
                    ? transports.get(sessionId)
                    : undefined;

                if (!transport) {
                    res.writeHead(404);
                    res.end('Session not found');
                    return;
                }

                await transport.handlePostMessage(req, res);
                return;
            }

            if (url.pathname === '/health') {
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                });
                res.end(JSON.stringify({ status: 'ok' }));
                return;
            }

            if (url.pathname.startsWith('/api/')) {
                if (
                    handleApiRequest(
                        ctx,
                        url.pathname,
                        req,
                        res
                    )
                )
                    return;
            }

            const webDistDir = path.resolve(
                __dirname,
                '../../../web/dist'
            );
            if (fs.existsSync(webDistDir)) {
                if (
                    serveStatic(
                        webDistDir,
                        url.pathname,
                        res
                    )
                )
                    return;
            }

            res.writeHead(404);
            res.end('Not found');
        });

        httpServer.listen(port, () => {
            console.log(
                `Synapse server running on http://localhost:${port}`
            );
            console.log(
                `MCP SSE endpoint: http://localhost:${port}/sse`
            );
            console.log(
                `Health check: http://localhost:${port}/health`
            );
        });

        process.on('SIGINT', () => {
            httpServer.close();
            db.close();
            process.exit(0);
        });
    });

program
    .command('mcp')
    .description('Start MCP server only (stdio, for editor integration)')
    .action(async () => {
        const { StdioServerTransport } = await import(
            '@modelcontextprotocol/sdk/server/stdio.js'
        );

        const projectRoot = process.cwd();
        const brainDir = ensureBrainDir(projectRoot);
        const symbioteHome = ensureSymbioteHome();
        const dbPath = getBrainDbPath(projectRoot);
        const db = createDatabase(dbPath);

        const ctx = createServerContext({
            db,
            brainDir,
            symbioteHome,
        });
        const { server } = createMcpServer(ctx);

        const transport = new StdioServerTransport();
        await server.connect(transport);

        process.on('SIGINT', () => {
            db.close();
            process.exit(0);
        });
    });

const dnaCommand = program
    .command('dna')
    .description('View and manage your developer DNA');

dnaCommand
    .command('list')
    .description('List all DNA entries')
    .option(
        '-s, --status <status>',
        'Filter by status (suggested, approved, rejected)'
    )
    .option(
        '-c, --category <category>',
        'Filter by category (style, preferences, anti-patterns, decisions)'
    )
    .action(
        async (options: { status?: string; category?: string }) => {
            const symbioteHome = ensureSymbioteHome();
            const dnaDir = path.join(symbioteHome, 'dna');
            const storage = new DnaStorage(dnaDir);
            storage.ensureDirectories();

            const entries = storage.listEntries({
                status: options.status as 'suggested' | 'approved' | 'rejected',
                category: options.category as 'style' | 'preferences' | 'anti-patterns' | 'decisions',
            });

            if (entries.length === 0) {
                console.log('No DNA entries found.');
                return;
            }

            console.log(
                `\nDeveloper DNA — ${entries.length} entries\n`
            );
            console.log('\u2500'.repeat(70));

            for (const entry of entries) {
                const fm = entry.frontmatter;
                const statusIcon =
                    fm.status === 'approved'
                        ? '[+]'
                        : fm.status === 'rejected'
                            ? '[-]'
                            : '[?]';

                console.log(
                    `${statusIcon} ${fm.id}  (${fm.category}, confidence: ${fm.confidence}, occurrences: ${fm.occurrences})`
                );
                console.log(
                    `    ${entry.content.slice(0, 100)}${entry.content.length > 100 ? '...' : ''}`
                );
                console.log('\u2500'.repeat(70));
            }
        }
    );

dnaCommand
    .command('approve <id>')
    .description('Approve a suggested DNA entry')
    .action(async (id: string) => {
        const symbioteHome = ensureSymbioteHome();
        const dnaDir = path.join(symbioteHome, 'dna');
        const storage = new DnaStorage(dnaDir);
        storage.ensureDirectories();
        const engine = new DnaEngine(storage);

        const entry = engine.approveEntry(id);
        if (entry) {
            console.log(`Approved: ${entry.frontmatter.id}`);
        } else {
            console.log(`Entry not found: ${id}`);
        }
    });

dnaCommand
    .command('reject <id>')
    .description('Reject a suggested DNA entry')
    .action(async (id: string) => {
        const symbioteHome = ensureSymbioteHome();
        const dnaDir = path.join(symbioteHome, 'dna');
        const storage = new DnaStorage(dnaDir);
        storage.ensureDirectories();
        const engine = new DnaEngine(storage);

        const entry = engine.rejectEntry(id);
        if (entry) {
            console.log(`Rejected: ${entry.frontmatter.id}`);
        } else {
            console.log(`Entry not found: ${id}`);
        }
    });

dnaCommand
    .command('show <id>')
    .description('Show a specific DNA entry')
    .action(async (id: string) => {
        const symbioteHome = ensureSymbioteHome();
        const dnaDir = path.join(symbioteHome, 'dna');
        const storage = new DnaStorage(dnaDir);
        storage.ensureDirectories();

        const entry = storage.readEntry(id);
        if (!entry) {
            console.log(`Entry not found: ${id}`);
            return;
        }

        const fm = entry.frontmatter;
        console.log(`\nID:          ${fm.id}`);
        console.log(`Category:    ${fm.category}`);
        console.log(`Status:      ${fm.status}`);
        console.log(`Confidence:  ${fm.confidence}`);
        console.log(`Source:      ${fm.source}`);
        console.log(`First seen:  ${fm.firstSeen}`);
        console.log(`Last seen:   ${fm.lastSeen}`);
        console.log(`Occurrences: ${fm.occurrences}`);
        console.log(`Sessions:    ${fm.sessionIds.length}`);
        console.log(`\n${entry.content}\n`);
    });

dnaCommand
    .command('delete <id>')
    .description('Delete a DNA entry')
    .action(async (id: string) => {
        const symbioteHome = ensureSymbioteHome();
        const dnaDir = path.join(symbioteHome, 'dna');
        const storage = new DnaStorage(dnaDir);
        storage.ensureDirectories();

        storage.deleteEntry(id);
        console.log(`Deleted: ${id}`);
    });

dnaCommand.action(async () => {
    const symbioteHome = ensureSymbioteHome();
    const dnaDir = path.join(symbioteHome, 'dna');
    const storage = new DnaStorage(dnaDir);
    storage.ensureDirectories();

    const all = storage.listEntries();
    const approved = all.filter(
        (e) => e.frontmatter.status === 'approved'
    );
    const suggested = all.filter(
        (e) => e.frontmatter.status === 'suggested'
    );
    const rejected = all.filter(
        (e) => e.frontmatter.status === 'rejected'
    );

    console.log('\nDeveloper DNA Summary');
    console.log('\u2500'.repeat(21));
    console.log(`Total:     ${all.length}`);
    console.log(`Approved:  ${approved.length}`);
    console.log(`Suggested: ${suggested.length}`);
    console.log(`Rejected:  ${rejected.length}`);

    if (suggested.length > 0) {
        console.log('\nPending review:');
        for (const entry of suggested) {
            console.log(
                `  [?] ${entry.frontmatter.id} (confidence: ${entry.frontmatter.confidence})`
            );
        }
        console.log(
            "\nRun 'synapse dna approve <id>' or 'synapse dna reject <id>' to review."
        );
    }

    console.log();
});

program.action(async () => {
    const { SmartInit } = await import('../src/init/index.js');

    const projectRoot = process.cwd();

    const symbioteHome = ensureSymbioteHome();
    const brainDir = ensureBrainDir(projectRoot);

    const dbPath = getBrainDbPath(projectRoot);
    const db = createDatabase(dbPath);
    const repo = new Repository(db);
    const scanner = new Scanner(repo);

    console.log('Scanning codebase...');
    const scanResult = await scanner.scan(projectRoot);

    console.log('Analyzing project...');
    const init = new SmartInit({
        projectRoot,
        symbioteHome,
        brainDir,
        scanResult,
    });

    const result = init.run();

    console.log(
        `Synapse is ready. Brain: ${scanResult.nodesCreated} nodes, ` +
            `${scanResult.edgesCreated} edges. ` +
            `Rules: ${result.rulesImported} imported. ` +
            `DNA: ${result.dnaEntriesLoaded + result.dnaEntriesImported} entries.`
    );

    if (scanResult.errors.length > 0) {
        console.log(
            `${scanResult.errors.length} files had errors.`
        );
    }

    console.log(
        "Run 'synapse serve' to start the MCP server and web UI."
    );
    db.close();
});

program.parse();
