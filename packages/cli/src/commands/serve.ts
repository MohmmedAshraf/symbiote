import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
    ensureBrainDir,
    ensureSymbioteHome,
    getBrainDbPath,
    getProjectPort,
    writePortFile,
    clearPortFile,
} from '#utils/config.js';
import { createMcpServer } from '#mcp/server.js';
import { createServerContext } from '#mcp/context.js';
import {
    createDatabaseWithRetry,
    isPortServing,
    openBrowser,
    handleHttpRequest,
} from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function cmdServe(flags: Record<string, string | boolean>): Promise<void> {
    const http = await import('node:http');

    const projectRoot = process.cwd();
    const port =
        typeof flags.port === 'string' ? parseInt(flags.port, 10) : getProjectPort(projectRoot);

    const noOpen = !!flags['no-open'];

    const alreadyRunning = await isPortServing(port);
    if (alreadyRunning) {
        const url = `http://localhost:${port}`;
        p.intro(pc.bold('Symbiote') + pc.dim(' — Brain is alive'));
        p.log.info(`${pc.dim('Web UI:')}  ${url}`);
        if (!noOpen) {
            p.outro(pc.dim('Opening browser...'));
            openBrowser(url);
        } else {
            p.outro(pc.dim('Already running.'));
        }
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
        rootDir: projectRoot,
    });
    const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
    const sessions = new Map<
        string,
        {
            transport: InstanceType<typeof SSEServerTransport>;
            server: ReturnType<typeof createMcpServer>['server'];
        }
    >();

    const webDistDir = path.resolve(__dirname, '../../../../web/dist');

    const httpServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost:${port}`);

        if (url.pathname === '/sse' && req.method === 'GET') {
            const transport = new SSEServerTransport('/messages', res);
            const { server } = createMcpServer(ctx);
            sessions.set(transport.sessionId, { transport, server });
            server.connect(transport).catch((err) => {
                sessions.delete(transport.sessionId);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end(String(err));
                }
            });
            return;
        }

        if (url.pathname === '/messages' && req.method === 'POST') {
            const sessionId = url.searchParams.get('sessionId');
            const session = sessionId ? sessions.get(sessionId) : undefined;
            if (!session) {
                res.writeHead(404);
                res.end('Session not found');
                return;
            }
            session.transport.handlePostMessage(req, res);
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
                `${pc.dim('Health:')}       http://localhost:${port}/internal/health`,
        );
        p.outro(pc.dim('Press Ctrl+C to stop.'));
        if (!noOpen) openBrowser(url);
    });

    process.on('SIGINT', () => {
        clearPortFile(projectRoot);
        httpServer.close();
        db.close();
        process.exit(0);
    });
}
