#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { createDatabase } from '../src/storage/db.js';
import { Repository } from '../src/storage/repository.js';
import { Scanner } from '../src/core/scanner.js';
import {
    ensureBrainDir,
    ensureSymbioteHome,
    getBrainDbPath,
    getProjectPort,
    writePortFile,
    clearPortFile,
} from '../src/utils/config.js';
import { DnaStorage } from '../src/dna/storage.js';
import { DnaEngine } from '../src/dna/engine.js';
import { createMcpServer } from '../src/mcp/server.js';
import { createServerContext } from '../src/mcp/context.js';
import {
    handleApiRequest,
    handleInternalEvent,
    handleSseConnection,
    handleHookContext,
} from '../src/mcp/http-api.js';

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

function serveStatic(webDistDir: string, pathname: string, res: ServerResponse): boolean {
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(webDistDir, safePath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(webDistDir, 'index.html');
    }

    if (!fs.existsSync(filePath)) return false;

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return true;
}

const RESET = '\x1b[0m';

const LOGO_LINES = [
    '███████╗██╗   ██╗███╗   ███╗██████╗ ██╗ ██████╗ ████████╗███████╗',
    '██╔════╝╚██╗ ██╔╝████╗ ████║██╔══██╗██║██╔═══██╗╚══██╔══╝██╔════╝',
    '███████╗ ╚████╔╝ ██╔████╔██║██████╔╝██║██║   ██║   ██║   █████╗  ',
    '╚════██║  ╚██╔╝  ██║╚██╔╝██║██╔══██╗██║██║   ██║   ██║   ██╔══╝  ',
    '███████║   ██║   ██║ ╚═╝ ██║██████╔╝██║╚██████╔╝   ██║   ███████╗',
    '╚══════╝   ╚═╝   ╚═╝     ╚═╝╚═════╝ ╚═╝ ╚═════╝    ╚═╝   ╚══════╝',
];

const GRAYS = [
    '\x1b[38;5;250m',
    '\x1b[38;5;248m',
    '\x1b[38;5;245m',
    '\x1b[38;5;243m',
    '\x1b[38;5;240m',
    '\x1b[38;5;238m',
];

function openBrowser(url: string): void {
    const cmd =
        process.platform === 'darwin'
            ? 'open'
            : process.platform === 'win32'
              ? 'start'
              : 'xdg-open';
    import('node:child_process').then(({ exec }) => exec(`${cmd} ${url}`));
}

function showLogo(): void {
    console.log();
    LOGO_LINES.forEach((line, i) => {
        console.log(`${GRAYS[i]}${line}${RESET}`);
    });
}

function showHelp(): void {
    showLogo();
    console.log();
    console.log(pc.dim('  Your codebase gets a brain. Your AI never forgets who you are.'));
    console.log();
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote init')}          Initialize for the current project`,
    );
    console.log(`  ${pc.bold('$')} ${pc.cyan('symbiote scan')}          Rescan codebase`);
    console.log(`  ${pc.bold('$')} ${pc.cyan('symbiote serve')}         Start MCP server + web UI`);
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote mcp')}           MCP server only (for editors)`,
    );
    console.log(`  ${pc.bold('$')} ${pc.cyan('symbiote dna')}           View your developer DNA`);
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote impact')}        Analyze impact of working changes`,
    );
    console.log(`  ${pc.bold('$')} ${pc.cyan('symbiote unbond')}        Detach from all AI agents`);
    console.log();
    console.log(pc.dim('  Claude Code Hooks:'));
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote hooks install')}  Register hooks with Claude Code`,
    );
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote hooks uninstall')} Remove hooks from Claude Code`,
    );
    console.log();
    console.log(pc.dim('  Connect to Claude Code:'));
    console.log(`    ${pc.dim('claude mcp add symbiote -- npx symbiote-cli mcp')}`);
    console.log();
}

function parseArgs(argv: string[]): {
    command: string;
    args: string[];
    flags: Record<string, string | boolean>;
} {
    const raw = argv.slice(2);
    const command = raw.find((a) => !a.startsWith('-')) ?? '';
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    let skipNext = false;
    for (let i = 0; i < raw.length; i++) {
        if (skipNext) {
            skipNext = false;
            continue;
        }
        const arg = raw[i];
        if (arg === command && args.length === 0 && !arg.startsWith('-')) {
            continue;
        }
        if (arg.startsWith('--')) {
            const eqIdx = arg.indexOf('=');
            if (eqIdx !== -1) {
                flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
            } else if (i + 1 < raw.length && !raw[i + 1].startsWith('-')) {
                flags[arg.slice(2)] = raw[i + 1];
                skipNext = true;
            } else {
                flags[arg.slice(2)] = true;
            }
        } else if (arg.startsWith('-') && arg.length === 2) {
            const short = arg[1];
            const longMap: Record<string, string> = {
                f: 'force',
                e: 'embeddings',
                p: 'port',
                s: 'status',
                c: 'category',
                h: 'help',
                v: 'version',
            };
            const long = longMap[short] ?? short;
            if (i + 1 < raw.length && !raw[i + 1].startsWith('-')) {
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

async function killSymbioteProcesses(): Promise<boolean> {
    const { execSync: exec } = await import('node:child_process');
    try {
        const output = exec('pgrep -f "symbiote-cli mcp|symbiote mcp"', {
            encoding: 'utf-8',
        }).trim();
        if (!output) return false;

        const pids = output
            .split('\n')
            .map((p) => parseInt(p, 10))
            .filter((pid) => pid && pid !== process.pid);
        if (pids.length === 0) return false;

        for (const pid of pids) {
            try {
                process.kill(pid, 'SIGTERM');
            } catch {
                // already dead
            }
        }

        await new Promise((r) => setTimeout(r, 1000));
        return true;
    } catch {
        return false;
    }
}

async function createDatabaseWithRetry(dbPath: string): Promise<SymbioteDB> {
    try {
        return await createDatabase(dbPath);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('lock')) throw err;

        const killed = await killSymbioteProcesses();
        if (!killed) throw err;

        await new Promise((r) => setTimeout(r, 500));
        return await createDatabase(dbPath);
    }
}

type SymbioteDB = Awaited<ReturnType<typeof createDatabase>>;

async function cmdInit(): Promise<void> {
    const { SmartInit } = await import('../src/init/index.js');

    const projectRoot = process.cwd();

    p.intro(pc.bold('Symbiote') + pc.dim(' — Initializing project brain'));

    const symbioteHome = ensureSymbioteHome();
    const brainDir = ensureBrainDir(projectRoot);

    const dbPath = getBrainDbPath(projectRoot);
    const db = await createDatabaseWithRetry(dbPath);
    const repo = new Repository(db);
    const scanner = new Scanner(repo, db);

    const s1 = p.spinner();
    s1.start('Scanning codebase...');
    const scanResult = await scanner.scan(projectRoot, { embeddings: true });
    s1.stop(
        `${scanResult.filesScanned} files` +
            pc.dim(` · ${scanResult.nodesCreated} nodes · ${scanResult.edgesCreated} edges`),
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

    await db.close();

    const lines: string[] = [];
    if (result.rulesImported > 0) {
        lines.push(`${pc.dim('Rules imported:')}   ${result.rulesImported}`);
    }
    if (result.techStack.length > 0) {
        lines.push(
            `${pc.dim('Tech stack:')}      ${result.techStack.map((t) => t.name).join(', ')}`,
        );
    }
    if (result.architectureSignals.length > 0) {
        lines.push(
            `${pc.dim('Architecture:')}    ${result.architectureSignals
                .slice(0, 3)
                .map((s) => s.pattern)
                .join(', ')}`,
        );
    }
    if (result.intentEntriesCreated > 0) {
        lines.push(
            `${pc.dim('Intent entries:')}  ${result.intentEntriesCreated} constraints/decisions`,
        );
    }
    if (result.dnaEntriesImported > 0 || result.dnaEntriesLoaded > 0) {
        lines.push(
            `${pc.dim('DNA entries:')}     ${result.dnaEntriesLoaded} loaded, ${result.dnaEntriesImported} imported`,
        );
    }

    if (lines.length > 0) {
        p.log.info(lines.join('\n'));
    }

    if (scanResult.errors.length > 0) {
        p.log.warn(`${scanResult.errors.length} files had parse errors.`);
    }

    const { detectInstalledAgents, isBonded, connectWithHooks, ensureClaudeHooks } =
        await import('../src/init/agent-connector.js');

    const agents = detectInstalledAgents();
    const installed = agents.filter((a) => a.installed);

    if (installed.length === 0) {
        p.log.info(
            pc.dim(
                'No AI agents detected. Install Claude Code, Cursor, or another supported host,\n' +
                    'then run `symbiote init` again.',
            ),
        );
    } else {
        const alreadyBonded = installed.filter((a) => isBonded(a));
        const unbonded = installed.filter((a) => !isBonded(a));

        if (alreadyBonded.length > 0) {
            for (const agent of alreadyBonded) {
                if (agent.id === 'claude-code') {
                    ensureClaudeHooks();
                }
                p.log.info(`${pc.green('✓')} ${agent.name} ${pc.dim('[already bonded]')}`);
            }
        }

        if (unbonded.length > 0) {
            const options = unbonded.map((a) => ({
                value: a.id,
                label: a.name,
                hint: a.id === 'claude-code' ? 'MCP server + hooks' : 'MCP server',
            }));

            const selected = await p.multiselect({
                message: 'Bond with detected hosts?',
                options,
                initialValues: unbonded.map((a) => a.id),
                required: false,
            });

            if (p.isCancel(selected)) {
                p.log.info(pc.dim('Skipped bonding.'));
            } else if (Array.isArray(selected) && selected.length > 0) {
                const toBond = unbonded.filter((a) => selected.includes(a.id));
                for (const agent of toBond) {
                    const s3 = p.spinner();
                    s3.start(`Bonding with ${agent.name}...`);
                    const result = connectWithHooks(agent);
                    if (result.mcp.success && result.hooks.success) {
                        const detail =
                            agent.id === 'claude-code'
                                ? 'MCP server added, hooks installed'
                                : 'MCP config written';
                        s3.stop(`${agent.name} — ${detail}`);
                    } else if (result.mcp.success) {
                        s3.stop(`${agent.name} — MCP server added`);
                        p.log.warn(`Hooks failed — run \`symbiote hooks install\` manually`);
                    } else {
                        s3.stop(`${agent.name} — failed`);
                        p.log.error(result.mcp.message);
                    }
                }
            }
        }
    }

    p.outro('Your project has a brain.');
}

async function cmdScan(flags: Record<string, string | boolean>): Promise<void> {
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

async function cmdHookPre(): Promise<void> {
    const { readStdinPayload, writeResponse, fireHookEvent } =
        await import('../src/hooks/types.js');
    const http = await import('node:http');

    const projectRoot = process.cwd();
    const port = getProjectPort(projectRoot);

    const payload = await readStdinPayload();
    if (payload.type !== 'pre_tool_use') {
        writeResponse({ decision: 'allow' });
        return;
    }

    const filePath = payload.tool_input.file_path as string | undefined;
    const FILE_TOOLS = new Set(['Read', 'Edit', 'Write']);

    if (filePath && FILE_TOOLS.has(payload.tool_name)) {
        try {
            const params = new URLSearchParams({
                file: filePath,
                tool: payload.tool_name,
                root: projectRoot,
            });
            const url = `http://127.0.0.1:${port}/internal/hook-context?${params}`;

            const response = await new Promise<{ decision: string; message?: string }>(
                (resolve) => {
                    const req = http.get(url, { timeout: 3000 }, (res) => {
                        let data = '';
                        res.on('data', (chunk) => {
                            data += chunk;
                        });
                        res.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch {
                                resolve({ decision: 'allow' });
                            }
                        });
                    });
                    req.on('error', () => resolve({ decision: 'allow' }));
                    req.on('timeout', () => {
                        req.destroy();
                        resolve({ decision: 'allow' });
                    });
                },
            );

            writeResponse({
                decision: response.decision as 'allow' | 'block',
                message: response.message,
            });
        } catch {
            writeResponse({ decision: 'allow' });
        }
    } else {
        writeResponse({ decision: 'allow' });
    }

    if (filePath && payload.tool_name === 'Read') {
        const relativePath = path.relative(projectRoot, filePath);
        await fireHookEvent(
            'file:read',
            { filePath: relativePath, toolName: payload.tool_name },
            port,
        );
    }
}

async function cmdHookPost(): Promise<void> {
    const { readStdinPayload, writeResponse, fireHookEvent } =
        await import('../src/hooks/types.js');

    const projectRoot = process.cwd();
    const port = getProjectPort(projectRoot);

    const payload = await readStdinPayload();
    if (payload.type !== 'post_tool_use') {
        writeResponse({ decision: 'allow' });
        return;
    }

    writeResponse({ decision: 'allow' });

    if (payload.tool_name === 'Edit' || payload.tool_name === 'Write') {
        const filePath = payload.tool_input.file_path as string | undefined;
        if (filePath) {
            const relativePath = path.relative(projectRoot, filePath);
            const isCreate = payload.tool_name === 'Write';
            await fireHookEvent(
                isCreate ? 'file:create' : 'file:edit',
                { filePath: relativePath, toolName: payload.tool_name },
                port,
            );
        }
    }
}

async function cmdHooksInstall(): Promise<void> {
    const { execSync } = await import('node:child_process');

    p.intro(pc.bold('Symbiote') + pc.dim(' — Installing Claude Code hooks'));

    try {
        execSync('claude hooks add pre_tool_use symbiote -- npx symbiote-cli hook pre', {
            stdio: 'inherit',
        });
        p.log.success('Registered pre_tool_use hook');
    } catch {
        p.log.error('Failed to register pre_tool_use hook');
    }

    try {
        execSync('claude hooks add post_tool_use symbiote -- npx symbiote-cli hook post', {
            stdio: 'inherit',
        });
        p.log.success('Registered post_tool_use hook');
    } catch {
        p.log.error('Failed to register post_tool_use hook');
    }

    p.outro('Hooks installed. Symbiote will inject context on every tool call.');
}

async function cmdHooksUninstall(): Promise<void> {
    const { execSync } = await import('node:child_process');

    p.intro(pc.bold('Symbiote') + pc.dim(' — Uninstalling Claude Code hooks'));

    try {
        execSync('claude hooks remove pre_tool_use symbiote', { stdio: 'inherit' });
        p.log.success('Removed pre_tool_use hook');
    } catch {
        p.log.error('Failed to remove pre_tool_use hook');
    }

    try {
        execSync('claude hooks remove post_tool_use symbiote', { stdio: 'inherit' });
        p.log.success('Removed post_tool_use hook');
    } catch {
        p.log.error('Failed to remove post_tool_use hook');
    }

    p.outro('Hooks uninstalled.');
}

async function cmdImpact(): Promise<void> {
    const projectRoot = process.cwd();
    const dbPath = getBrainDbPath(projectRoot);
    const db = await createDatabaseWithRetry(dbPath);

    p.intro(pc.bold('Symbiote') + pc.dim(' — Impact Analysis'));

    const s = p.spinner();
    s.start('Loading graph...');

    const { buildGraphFromDb } = await import('../src/core/graph-builder.js');
    const graph = await buildGraphFromDb(db);

    s.stop('Graph loaded');

    const s2 = p.spinner();
    s2.start('Analyzing working changes...');

    const { GitImpactAnalyzer } = await import('../src/core/git-impact.js');
    const gitImpact = new GitImpactAnalyzer(graph);
    let result;
    try {
        result = gitImpact.analyzeWorkingChanges(projectRoot);
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

async function handleHttpRequest(
    ctx: Awaited<ReturnType<typeof createServerContext>>,
    webDistDir: string,
    port: number,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }

    if (url.pathname === '/internal/events' && req.method === 'POST') {
        handleInternalEvent(ctx.eventBus, req, res);
        return;
    }

    if (url.pathname === '/internal/hook-context' && req.method === 'GET') {
        await handleHookContext(ctx, req, res);
        return;
    }

    if (url.pathname === '/events' && req.method === 'GET') {
        handleSseConnection(ctx.eventBus, req, res);
        return;
    }

    if (url.pathname.startsWith('/api/')) {
        if (await handleApiRequest(ctx, url.pathname, req, res)) return;
    }

    if (fs.existsSync(webDistDir)) {
        if (serveStatic(webDistDir, url.pathname, res)) return;
    }

    res.writeHead(404);
    res.end('Not found');
}

async function cmdServe(flags: Record<string, string | boolean>): Promise<void> {
    const http = await import('node:http');

    const projectRoot = process.cwd();
    const port =
        typeof flags.port === 'string' ? parseInt(flags.port, 10) : getProjectPort(projectRoot);

    const alreadyRunning = await isPortServing(port);
    if (alreadyRunning) {
        const url = `http://localhost:${port}`;
        p.intro(pc.bold('Symbiote') + pc.dim(' — Brain is alive'));
        p.log.info(`${pc.dim('Web UI:')}  ${url}`);
        p.outro(pc.dim('Opening browser...'));
        openBrowser(url);
        return;
    }

    const brainDir = ensureBrainDir(projectRoot);
    const symbioteHome = ensureSymbioteHome();
    const dbPath = getBrainDbPath(projectRoot);

    const db = await createDatabaseWithRetry(dbPath);

    const ctx = await createServerContext({
        db,
        brainDir,
        symbioteHome,
    });
    const { server } = createMcpServer(ctx);

    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    const transports = new Map<string, InstanceType<typeof SSEServerTransport>>();

    const webDistDir = path.resolve(__dirname, '../../../web/dist');

    const httpServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`);

        if (url.pathname === '/sse' && req.method === 'GET') {
            const transport = new SSEServerTransport('/messages', res);
            transports.set(transport.sessionId, transport);
            server.connect(transport).catch((err) => {
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end(String(err));
                }
            });
            return;
        }

        if (url.pathname === '/messages' && req.method === 'POST') {
            const sessionId = url.searchParams.get('sessionId');
            const transport = sessionId ? transports.get(sessionId) : undefined;
            if (!transport) {
                res.writeHead(404);
                res.end('Session not found');
                return;
            }
            transport.handlePostMessage(req, res);
            return;
        }

        handleHttpRequest(ctx, webDistDir, port, url, req, res).catch((err) => {
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: String(err) }));
            }
        });
    });

    httpServer.listen(port, () => {
        writePortFile(projectRoot, port);
        const url = `http://localhost:${port}`;
        p.intro(pc.bold('Symbiote') + pc.dim(' — Brain is alive'));
        p.log.info(
            `${pc.dim('Web UI:')}       ${url}\n` +
                `${pc.dim('MCP SSE:')}      http://localhost:${port}/sse\n` +
                `${pc.dim('Health:')}       http://localhost:${port}/health`,
        );
        p.outro(pc.dim('Press Ctrl+C to stop.'));
        openBrowser(url);
    });

    process.on('SIGINT', () => {
        clearPortFile(projectRoot);
        httpServer.close();
        db.close();
        process.exit(0);
    });
}

async function isPortServing(port: number): Promise<boolean> {
    const http = await import('node:http');
    return new Promise((resolve) => {
        const req = http.request(
            { hostname: '127.0.0.1', port, path: '/health', timeout: 1000 },
            (res) => {
                res.resume();
                resolve(res.statusCode === 200);
            },
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        req.end();
    });
}

async function cmdMcp(): Promise<void> {
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    const http = await import('node:http');

    const projectRoot = process.cwd();
    const brainDir = ensureBrainDir(projectRoot);
    const symbioteHome = ensureSymbioteHome();
    const dbPath = getBrainDbPath(projectRoot);

    const db = await createDatabase(dbPath);

    const ctx = await createServerContext({
        db,
        brainDir,
        symbioteHome,
    });
    const { server } = createMcpServer(ctx);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    const port = getProjectPort(projectRoot);

    const webDistDir = path.resolve(__dirname, '../../../web/dist');
    const httpServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`);
        handleHttpRequest(ctx, webDistDir, port, url, req, res).catch((err) => {
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: String(err) }));
            }
        });
    });

    httpServer.listen(port, () => {
        writePortFile(projectRoot, port);
        process.stderr.write(`[symbiote] Web UI available at http://localhost:${port}\n`);
    });

    httpServer.on('error', () => {
        // Port already in use — skip HTTP server silently
    });

    process.on('SIGINT', () => {
        clearPortFile(projectRoot);
        httpServer.close();
        db.close();
        process.exit(0);
    });
}

async function cmdDna(
    subcommand: string | undefined,
    args: string[],
    flags: Record<string, string | boolean>,
): Promise<void> {
    const symbioteHome = ensureSymbioteHome();
    const dnaDir = path.join(symbioteHome, 'dna');
    const storage = new DnaStorage(dnaDir);
    storage.ensureDirectories();

    if (!subcommand || subcommand === 'dna') {
        const all = storage.listEntries();
        const approved = all.filter((e) => e.frontmatter.status === 'approved');
        const suggested = all.filter((e) => e.frontmatter.status === 'suggested');
        const rejected = all.filter((e) => e.frontmatter.status === 'rejected');

        p.intro(pc.bold('Developer DNA'));
        p.log.info(
            `${pc.dim('Total:')}     ${all.length}\n` +
                `${pc.dim('Approved:')}  ${approved.length}\n` +
                `${pc.dim('Suggested:')} ${suggested.length}\n` +
                `${pc.dim('Rejected:')}  ${rejected.length}`,
        );

        if (suggested.length > 0) {
            p.log.warn('Pending review:');
            for (const entry of suggested) {
                console.log(
                    `  ${pc.yellow('[?]')} ${entry.frontmatter.id} ${pc.dim(`(confidence: ${entry.frontmatter.confidence})`)}`,
                );
            }
            console.log();
            console.log(
                pc.dim(
                    "  Run 'symbiote dna approve <id>' or 'symbiote dna reject <id>' to review.",
                ),
            );
        }

        p.outro('');
        return;
    }

    if (subcommand === 'list') {
        const entries = storage.listEntries({
            status: (typeof flags.status === 'string' ? flags.status : undefined) as
                | 'suggested'
                | 'approved'
                | 'rejected'
                | undefined,
            category: (typeof flags.category === 'string' ? flags.category : undefined) as
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

        console.log(`\n${pc.bold('Developer DNA')} ${pc.dim(`— ${entries.length} entries`)}\n`);
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
                `${statusIcon} ${pc.bold(fm.id)}  ${pc.dim(`(${fm.category}, confidence: ${fm.confidence}, occurrences: ${fm.occurrences})`)}`,
            );
            console.log(
                `    ${entry.content.slice(0, 100)}${entry.content.length > 100 ? '...' : ''}`,
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
        console.log(`${pc.dim('ID:')}          ${pc.bold(fm.id)}`);
        console.log(`${pc.dim('Category:')}    ${fm.category}`);
        console.log(`${pc.dim('Status:')}      ${fm.status}`);
        console.log(`${pc.dim('Confidence:')}  ${fm.confidence}`);
        console.log(`${pc.dim('Source:')}      ${fm.source}`);
        console.log(`${pc.dim('First seen:')}  ${fm.firstSeen}`);
        console.log(`${pc.dim('Last seen:')}   ${fm.lastSeen}`);
        console.log(`${pc.dim('Occurrences:')} ${fm.occurrences}`);
        console.log(`${pc.dim('Sessions:')}    ${fm.sessionIds.length}`);
        console.log(`\n${entry.content}\n`);
        return;
    }

    if (subcommand === 'approve') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna approve <id>');
            process.exit(1);
        }

        const engine = new DnaEngine(storage);
        const entry = engine.approveEntry(id);
        if (entry) {
            p.log.success(`Approved: ${entry.frontmatter.id}`);
        } else {
            p.log.error(`Entry not found: ${id}`);
        }
        return;
    }

    if (subcommand === 'reject') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna reject <id>');
            process.exit(1);
        }

        const engine = new DnaEngine(storage);
        const entry = engine.rejectEntry(id);
        if (entry) {
            p.log.success(`Rejected: ${entry.frontmatter.id}`);
        } else {
            p.log.error(`Entry not found: ${id}`);
        }
        return;
    }

    if (subcommand === 'delete') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna delete <id>');
            process.exit(1);
        }

        storage.deleteEntry(id);
        p.log.success(`Deleted: ${id}`);
        return;
    }

    p.log.error(`Unknown DNA subcommand: ${subcommand}`);
    console.log(pc.dim('  Available: list, show, approve, reject, delete'));
    process.exit(1);
}

async function cmdUnbond(targetId?: string): Promise<void> {
    const { detectInstalledAgents, isBonded, disconnectWithHooks } =
        await import('../src/init/agent-connector.js');

    p.intro(pc.bold('Symbiote') + pc.dim(' — Detaching'));

    const agents = detectInstalledAgents();
    const bonded = agents.filter((a) => a.installed && isBonded(a));

    if (bonded.length === 0) {
        p.outro('No bonded hosts found.');
        return;
    }

    const toUnbond = targetId ? bonded.filter((a) => a.id === targetId) : bonded;

    if (targetId && toUnbond.length === 0) {
        p.log.error(`Host not found or not bonded: ${targetId}`);
        p.outro('');
        return;
    }

    for (const agent of toUnbond) {
        const result = disconnectWithHooks(agent);
        if (result.mcp.success) {
            p.log.success(`Detached from ${agent.name}`);
        } else {
            p.log.error(`Failed to detach from ${agent.name}: ${result.mcp.message}`);
        }
    }

    p.outro('Symbiote detached.');
}

async function main(): Promise<void> {
    const { command, args, flags } = parseArgs(process.argv);

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
        case 'impact':
            await cmdImpact();
            break;
        case 'hook': {
            const subcommand = args[0];
            if (subcommand === 'pre') {
                await cmdHookPre();
            } else if (subcommand === 'post') {
                await cmdHookPost();
            } else {
                p.log.error(`Unknown hook subcommand: ${subcommand}`);
                console.log(pc.dim('  Available: pre, post'));
                process.exit(1);
            }
            break;
        }
        case 'hooks': {
            const subcommand = args[0];
            if (subcommand === 'install') {
                await cmdHooksInstall();
            } else if (subcommand === 'uninstall') {
                await cmdHooksUninstall();
            } else {
                p.log.error(`Unknown hooks subcommand: ${subcommand}`);
                console.log(pc.dim('  Available: install, uninstall'));
                process.exit(1);
            }
            break;
        }
        case 'dna': {
            const subcommand = args[0];
            const subArgs = args.slice(1);
            await cmdDna(subcommand, subArgs, flags);
            break;
        }
        case 'unbond': {
            const targetId = args[0];
            await cmdUnbond(targetId);
            break;
        }
        default:
            p.log.error(`Unknown command: ${command}`);
            showHelp();
            process.exit(1);
    }
}

const LONG_RUNNING_COMMANDS = new Set(['serve', 'mcp', 'hook']);

function forceExit(code: number): void {
    try {
        process.kill(process.pid, code === 0 ? 'SIGTERM' : 'SIGTERM');
    } catch {
        process.exit(code);
    }
}

main()
    .then(() => {
        const { command } = parseArgs(process.argv);
        if (!LONG_RUNNING_COMMANDS.has(command)) {
            forceExit(0);
        }
    })
    .catch((err) => {
        p.log.error(err instanceof Error ? err.message : String(err));
        forceExit(1);
    });
