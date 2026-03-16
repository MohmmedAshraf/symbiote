#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerResponse } from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { createDatabase } from '../src/storage/db.js';
import { Repository } from '../src/storage/repository.js';
import { Scanner } from '../src/core/scanner.js';
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

const LOGO = `
${pc.bold(pc.white('███████╗██╗   ██╗███╗   ███╗██████╗ ██╗ ██████╗ ████████╗███████╗'))}
${pc.white('██╔════╝╚██╗ ██╔╝████╗ ████║██╔══██╗██║██╔═══██╗╚══██╔══╝██╔════╝')}
${pc.gray('███████╗ ╚████╔╝ ██╔████╔██║██████╔╝██║██║   ██║   ██║   █████╗')}
${pc.gray('╚════██║  ╚██╔╝  ██║╚██╔╝██║██╔══██╗██║██║   ██║   ██║   ██╔══╝')}
${pc.dim('███████║   ██║   ██║ ╚═╝ ██║██████╔╝██║╚██████╔╝   ██║   ███████╗')}
${pc.dim('╚══════╝   ╚═╝   ╚═╝     ╚═╝╚═════╝ ╚═╝ ╚═════╝    ╚═╝   ╚══════╝')}`;

function showHelp(): void {
    console.log(LOGO);
    console.log();
    console.log(
        pc.dim(
            '  Your codebase gets a brain. Your AI never forgets who you are.'
        )
    );
    console.log();
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote init')}          Initialize for the current project`
    );
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote scan')}          Rescan codebase`
    );
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote serve')}         Start MCP server + web UI`
    );
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote mcp')}           MCP server only (for editors)`
    );
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote dna')}           View your developer DNA`
    );
    console.log();
    console.log(pc.dim('  Connect to Claude Code:'));
    console.log(
        `    ${pc.dim('claude mcp add symbiote -- npx symbiote-cli mcp')}`
    );
    console.log();
}

function parseArgs(argv: string[]): {
    command: string;
    args: string[];
    flags: Record<string, string | boolean>;
} {
    const raw = argv.slice(2);
    const command =
        raw.find((a) => !a.startsWith('-')) ?? '';
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    let skipNext = false;
    for (let i = 0; i < raw.length; i++) {
        if (skipNext) {
            skipNext = false;
            continue;
        }
        const arg = raw[i];
        if (
            arg === command &&
            args.length === 0 &&
            !arg.startsWith('-')
        ) {
            continue;
        }
        if (arg.startsWith('--')) {
            const eqIdx = arg.indexOf('=');
            if (eqIdx !== -1) {
                flags[arg.slice(2, eqIdx)] = arg.slice(
                    eqIdx + 1
                );
            } else if (
                i + 1 < raw.length &&
                !raw[i + 1].startsWith('-')
            ) {
                flags[arg.slice(2)] = raw[i + 1];
                skipNext = true;
            } else {
                flags[arg.slice(2)] = true;
            }
        } else if (arg.startsWith('-') && arg.length === 2) {
            const short = arg[1];
            const longMap: Record<string, string> = {
                f: 'force',
                p: 'port',
                s: 'status',
                c: 'category',
                h: 'help',
                v: 'version',
            };
            const long = longMap[short] ?? short;
            if (
                i + 1 < raw.length &&
                !raw[i + 1].startsWith('-')
            ) {
                flags[long] = raw[i + 1];
                skipNext = true;
            } else {
                flags[long] = true;
            }
        } else {
            args.push(arg);
        }
    }

    return { command, args, flags };
}

async function cmdInit(): Promise<void> {
    const { SmartInit } = await import(
        '../src/init/index.js'
    );

    const projectRoot = process.cwd();

    p.intro(
        pc.bold('Symbiote') +
            pc.dim(' — Initializing project brain')
    );

    const symbioteHome = ensureSymbioteHome();
    const brainDir = ensureBrainDir(projectRoot);

    const dbPath = getBrainDbPath(projectRoot);
    const db = createDatabase(dbPath);
    const repo = new Repository(db);
    const scanner = new Scanner(repo);

    const s1 = p.spinner();
    s1.start('Scanning codebase...');
    const scanResult = await scanner.scan(projectRoot);
    s1.stop(
        `${scanResult.filesScanned} files` +
            pc.dim(
                ` · ${scanResult.nodesCreated} nodes · ${scanResult.edgesCreated} edges`
            )
    );

    const s2 = p.spinner();
    s2.start('Analyzing project...');
    const init = new SmartInit({
        projectRoot,
        symbioteHome,
        brainDir,
        scanResult,
    });
    const result = init.run();
    s2.stop('Project analyzed');

    db.close();

    const lines: string[] = [];
    if (result.rulesImported > 0) {
        lines.push(
            `${pc.dim('Rules imported:')}   ${result.rulesImported}`
        );
    }
    if (result.techStack.length > 0) {
        lines.push(
            `${pc.dim('Tech stack:')}      ${result.techStack.map((t) => t.name).join(', ')}`
        );
    }
    if (result.architectureSignals.length > 0) {
        lines.push(
            `${pc.dim('Architecture:')}    ${result.architectureSignals.slice(0, 3).map((s) => s.pattern).join(', ')}`
        );
    }
    if (result.intentEntriesCreated > 0) {
        lines.push(
            `${pc.dim('Intent entries:')}  ${result.intentEntriesCreated} constraints/decisions`
        );
    }
    if (
        result.dnaEntriesImported > 0 ||
        result.dnaEntriesLoaded > 0
    ) {
        lines.push(
            `${pc.dim('DNA entries:')}     ${result.dnaEntriesLoaded} loaded, ${result.dnaEntriesImported} imported`
        );
    }

    if (lines.length > 0) {
        p.log.info(lines.join('\n'));
    }

    if (scanResult.errors.length > 0) {
        p.log.warn(
            `${scanResult.errors.length} files had parse errors.`
        );
    }

    p.outro('Your project has a brain.');

    console.log();
    console.log(pc.dim('  Connect to your AI:'));
    console.log(
        `    ${pc.cyan('claude mcp add symbiote -- npx symbiote-cli mcp')}`
    );
    console.log();
    console.log(pc.dim('  Or start the dashboard:'));
    console.log(`    ${pc.cyan('symbiote serve')}`);
    console.log();
}

async function cmdScan(
    flags: Record<string, string | boolean>
): Promise<void> {
    const projectRoot = process.cwd();
    const dbPath = getBrainDbPath(projectRoot);
    const db = createDatabase(dbPath);
    const repo = new Repository(db);
    const scanner = new Scanner(repo);

    const s = p.spinner();
    s.start('Scanning codebase...');
    const result = await scanner.scan(projectRoot, {
        force: flags.force === true,
    });
    db.close();

    s.stop(
        `Scanned: ${result.filesScanned}` +
            pc.dim(
                ` · Skipped: ${result.filesSkipped} · Nodes: ${result.nodesCreated} · Edges: ${result.edgesCreated}`
            )
    );
}

async function cmdServe(
    flags: Record<string, string | boolean>
): Promise<void> {
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

    const port =
        typeof flags.port === 'string'
            ? parseInt(flags.port, 10)
            : 3333;
    const transports = new Map<
        string,
        InstanceType<typeof SSEServerTransport>
    >();

    const httpServer = http.createServer(async (req, res) => {
        const url = new URL(
            req.url ?? '/',
            `http://localhost:${port}`
        );

        if (
            url.pathname === '/sse' &&
            req.method === 'GET'
        ) {
            const transport = new SSEServerTransport(
                '/messages',
                res
            );
            transports.set(
                transport.sessionId,
                transport
            );
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
                serveStatic(webDistDir, url.pathname, res)
            )
                return;
        }

        res.writeHead(404);
        res.end('Not found');
    });

    httpServer.listen(port, () => {
        p.intro(
            pc.bold('Symbiote') +
                pc.dim(' — Server running')
        );
        p.log.info(
            `${pc.dim('Web UI:')}       http://localhost:${port}\n` +
                `${pc.dim('MCP SSE:')}      http://localhost:${port}/sse\n` +
                `${pc.dim('Health:')}       http://localhost:${port}/health`
        );
        p.outro(pc.dim('Press Ctrl+C to stop.'));
    });

    process.on('SIGINT', () => {
        httpServer.close();
        db.close();
        process.exit(0);
    });
}

async function cmdMcp(): Promise<void> {
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
}

async function cmdDna(
    subcommand: string | undefined,
    args: string[],
    flags: Record<string, string | boolean>
): Promise<void> {
    const symbioteHome = ensureSymbioteHome();
    const dnaDir = path.join(symbioteHome, 'dna');
    const storage = new DnaStorage(dnaDir);
    storage.ensureDirectories();

    if (!subcommand || subcommand === 'dna') {
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

        p.intro(pc.bold('Developer DNA'));
        p.log.info(
            `${pc.dim('Total:')}     ${all.length}\n` +
                `${pc.dim('Approved:')}  ${approved.length}\n` +
                `${pc.dim('Suggested:')} ${suggested.length}\n` +
                `${pc.dim('Rejected:')}  ${rejected.length}`
        );

        if (suggested.length > 0) {
            p.log.warn('Pending review:');
            for (const entry of suggested) {
                console.log(
                    `  ${pc.yellow('[?]')} ${entry.frontmatter.id} ${pc.dim(`(confidence: ${entry.frontmatter.confidence})`)}`
                );
            }
            console.log();
            console.log(
                pc.dim(
                    "  Run 'symbiote dna approve <id>' or 'symbiote dna reject <id>' to review."
                )
            );
        }

        p.outro('');
        return;
    }

    if (subcommand === 'list') {
        const entries = storage.listEntries({
            status: (
                typeof flags.status === 'string'
                    ? flags.status
                    : undefined
            ) as
                | 'suggested'
                | 'approved'
                | 'rejected'
                | undefined,
            category: (
                typeof flags.category === 'string'
                    ? flags.category
                    : undefined
            ) as
                | 'style'
                | 'preferences'
                | 'anti-patterns'
                | 'decisions'
                | undefined,
        });

        if (entries.length === 0) {
            p.log.info('No DNA entries found.');
            return;
        }

        console.log(
            `\n${pc.bold('Developer DNA')} ${pc.dim(`— ${entries.length} entries`)}\n`
        );
        console.log(pc.dim('\u2500'.repeat(70)));

        for (const entry of entries) {
            const fm = entry.frontmatter;
            const statusIcon =
                fm.status === 'approved'
                    ? pc.green('[+]')
                    : fm.status === 'rejected'
                      ? pc.red('[-]')
                      : pc.yellow('[?]');

            console.log(
                `${statusIcon} ${pc.bold(fm.id)}  ${pc.dim(`(${fm.category}, confidence: ${fm.confidence}, occurrences: ${fm.occurrences})`)}`
            );
            console.log(
                `    ${entry.content.slice(0, 100)}${entry.content.length > 100 ? '...' : ''}`
            );
            console.log(pc.dim('\u2500'.repeat(70)));
        }
        return;
    }

    if (subcommand === 'show') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna show <id>');
            process.exit(1);
        }

        const entry = storage.readEntry(id);
        if (!entry) {
            p.log.error(`Entry not found: ${id}`);
            process.exit(1);
        }

        const fm = entry.frontmatter;
        console.log();
        console.log(
            `${pc.dim('ID:')}          ${pc.bold(fm.id)}`
        );
        console.log(
            `${pc.dim('Category:')}    ${fm.category}`
        );
        console.log(
            `${pc.dim('Status:')}      ${fm.status}`
        );
        console.log(
            `${pc.dim('Confidence:')}  ${fm.confidence}`
        );
        console.log(
            `${pc.dim('Source:')}      ${fm.source}`
        );
        console.log(
            `${pc.dim('First seen:')}  ${fm.firstSeen}`
        );
        console.log(
            `${pc.dim('Last seen:')}   ${fm.lastSeen}`
        );
        console.log(
            `${pc.dim('Occurrences:')} ${fm.occurrences}`
        );
        console.log(
            `${pc.dim('Sessions:')}    ${fm.sessionIds.length}`
        );
        console.log(`\n${entry.content}\n`);
        return;
    }

    if (subcommand === 'approve') {
        const id = args[0];
        if (!id) {
            p.log.error(
                'Usage: symbiote dna approve <id>'
            );
            process.exit(1);
        }

        const engine = new DnaEngine(storage);
        const entry = engine.approveEntry(id);
        if (entry) {
            p.log.success(
                `Approved: ${entry.frontmatter.id}`
            );
        } else {
            p.log.error(`Entry not found: ${id}`);
        }
        return;
    }

    if (subcommand === 'reject') {
        const id = args[0];
        if (!id) {
            p.log.error(
                'Usage: symbiote dna reject <id>'
            );
            process.exit(1);
        }

        const engine = new DnaEngine(storage);
        const entry = engine.rejectEntry(id);
        if (entry) {
            p.log.success(
                `Rejected: ${entry.frontmatter.id}`
            );
        } else {
            p.log.error(`Entry not found: ${id}`);
        }
        return;
    }

    if (subcommand === 'delete') {
        const id = args[0];
        if (!id) {
            p.log.error(
                'Usage: symbiote dna delete <id>'
            );
            process.exit(1);
        }

        storage.deleteEntry(id);
        p.log.success(`Deleted: ${id}`);
        return;
    }

    p.log.error(`Unknown DNA subcommand: ${subcommand}`);
    console.log(
        pc.dim(
            '  Available: list, show, approve, reject, delete'
        )
    );
    process.exit(1);
}

async function main(): Promise<void> {
    const { command, args, flags } = parseArgs(
        process.argv
    );

    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.version) {
        console.log('0.1.0');
        process.exit(0);
    }

    switch (command) {
        case '':
            showHelp();
            break;
        case 'init':
            await cmdInit();
            break;
        case 'scan':
            await cmdScan(flags);
            break;
        case 'serve':
            await cmdServe(flags);
            break;
        case 'mcp':
            await cmdMcp();
            break;
        case 'dna': {
            const subcommand = args[0];
            const subArgs = args.slice(1);
            await cmdDna(subcommand, subArgs, flags);
            break;
        }
        default:
            p.log.error(`Unknown command: ${command}`);
            showHelp();
            process.exit(1);
    }
}

main().catch((err) => {
    p.log.error(
        err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
});
