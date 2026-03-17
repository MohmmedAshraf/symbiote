import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../storage/db.js';
import {
    ensureBrainDir,
    ensureSymbioteHome,
    getBrainDbPath,
    getProjectPort,
    writePortFile,
    clearPortFile,
} from '../utils/config.js';
import { createMcpServer } from '../mcp/server.js';
import { createServerContext } from '../mcp/context.js';
import { handleHttpRequest } from './shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function cmdMcp(): Promise<void> {
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
        rootDir: projectRoot,
    });
    const { server } = createMcpServer(ctx);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    const port = getProjectPort(projectRoot);

    const webDistDir = path.resolve(__dirname, '../../../../web/dist');
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
