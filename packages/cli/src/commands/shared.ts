import fs from 'node:fs';
import path from 'node:path';
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

export async function isPortServing(port: number): Promise<boolean> {
    const http = await import('node:http');
    return new Promise((resolve) => {
        const req = http.request(
            { hostname: '127.0.0.1', port, path: '/internal/health', timeout: 1000 },
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

export async function handleHttpRequest(
    ctx: Awaited<ReturnType<typeof createServerContext>>,
    webDistDir: string,
    _port: number,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    if (url.pathname === '/internal/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
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
