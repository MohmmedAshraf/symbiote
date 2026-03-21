import fs from 'node:fs';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createDatabase } from '#storage/db.js';
import {
    handleApiRequest,
    handleInternalEvent,
    handleSseConnection,
    handleHookContext,
    handleHookRequest,
    handleSessionStartRequest,
} from '#mcp/http-api.js';
import { handleMcpProxy } from '#mcp/proxy-handler.js';
import type { createServerContext } from '#mcp/context.js';

export type SymbioteDB = Awaited<ReturnType<typeof createDatabase>>;

const __sharedDirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function findPackageJson(dir: string): string {
    const candidate = path.join(dir, 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found');
    return findPackageJson(parent);
}

const { version: SERVER_VERSION } = require(findPackageJson(__sharedDirname)) as {
    version: string;
};
const SERVER_STARTED_AT = Date.now();

export { SERVER_VERSION };

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

export function serveStatic(webDistDir: string, pathname: string, res: ServerResponse): boolean {
    const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(webDistDir, safePath);

    if (!filePath.startsWith(webDistDir)) return false;

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

export function openBrowser(url: string): void {
    const cmd =
        process.platform === 'darwin'
            ? 'open'
            : process.platform === 'win32'
              ? 'start'
              : 'xdg-open';
    import('node:child_process').then(({ execFile }) => execFile(cmd, [url]));
}

export async function killSymbioteProcesses(): Promise<boolean> {
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

export async function killProcessOnPort(port: number): Promise<void> {
    const { execSync } = await import('node:child_process');
    try {
        const output = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' }).trim();
        if (!output) return;

        const pids = output
            .split('\n')
            .map((p) => parseInt(p, 10))
            .filter((pid) => pid && pid !== process.pid);

        for (const pid of pids) {
            try {
                process.kill(pid, 'SIGTERM');
            } catch {
                // already dead
            }
        }

        await new Promise((r) => setTimeout(r, 1500));
    } catch {
        // lsof returns non-zero when no matches
    }
}

export async function createDatabaseWithRetry(dbPath: string): Promise<SymbioteDB> {
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

export interface ServerHealthInfo {
    status: string;
    version?: string;
    startedAt?: number;
}

export async function getRunningServerHealth(port: number): Promise<ServerHealthInfo | null> {
    const http = await import('node:http');
    return new Promise((resolve) => {
        const req = http.request(
            { hostname: '127.0.0.1', port, path: '/internal/health', timeout: 1000 },
            (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    resolve(null);
                    return;
                }
                let body = '';
                res.on('data', (chunk: string) => {
                    body += chunk;
                });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body) as ServerHealthInfo);
                    } catch {
                        resolve({ status: 'ok' });
                    }
                });
            },
        );
        req.on('error', () => resolve(null));
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
        req.end();
    });
}

export async function isPortServing(port: number): Promise<boolean> {
    const health = await getRunningServerHealth(port);
    return health !== null;
}

export function isServerVersionStale(health: ServerHealthInfo): boolean {
    if (health.version && health.version !== SERVER_VERSION) {
        return true;
    }
    return false;
}

export async function handleHttpRequest(
    ctx: Awaited<ReturnType<typeof createServerContext>>,
    webDistDir: string,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    if (url.pathname === '/internal/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                status: 'ok',
                version: SERVER_VERSION,
                startedAt: SERVER_STARTED_AT,
            }),
        );
        return;
    }

    if (url.pathname === '/internal/events' && req.method === 'POST') {
        await handleInternalEvent(ctx.eventBus, req, res);
        return;
    }

    if (url.pathname === '/internal/hook-context' && req.method === 'GET') {
        await handleHookContext(ctx, req, res);
        return;
    }

    if (url.pathname === '/internal/mcp-proxy' && req.method === 'POST') {
        await handleMcpProxy(ctx, req, res);
        return;
    }

    if (url.pathname.startsWith('/internal/hooks/') && req.method === 'POST') {
        await handleHookRequest(ctx, url.pathname, req, res);
        return;
    }

    if (url.pathname === '/internal/hooks/session-start' && req.method === 'GET') {
        await handleSessionStartRequest(ctx, url.searchParams, res);
        return;
    }

    if (url.pathname === '/events' && req.method === 'GET') {
        handleSseConnection(ctx.eventBus, req, res);
        return;
    }

    if (url.pathname.startsWith('/api/')) {
        if (await handleApiRequest(ctx, url.pathname, req, res)) return;
    }

    if (url.pathname.startsWith('/internal/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
    }

    if (fs.existsSync(webDistDir)) {
        if (serveStatic(webDistDir, url.pathname, res)) return;
    }

    res.writeHead(404);
    res.end('Not found');
}
