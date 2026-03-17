import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { sendEvent } from '#events/ipc.js';
import { createEvent } from '#events/types.js';

describe('IPC Client', () => {
    let server: http.Server;

    afterEach(() => {
        if (server) server.close();
    });

    it('sends event via HTTP POST to server', async () => {
        let receivedBody = '';
        server = http.createServer((req, res) => {
            let data = '';
            req.on('data', (chunk) => {
                data += chunk;
            });
            req.on('end', () => {
                receivedBody = data;
                res.writeHead(200);
                res.end();
            });
        });

        await new Promise<void>((resolve) => server.listen(0, resolve));
        const port = (server.address() as { port: number }).port;

        const event = createEvent('file:read', { filePath: 'src/auth.ts' });
        await sendEvent(event, port);

        const parsed = JSON.parse(receivedBody);
        expect(parsed.type).toBe('file:read');
        expect(parsed.data.filePath).toBe('src/auth.ts');
    });

    it('does not throw when server is not running', async () => {
        const event = createEvent('file:read', { filePath: 'src/auth.ts' });
        await expect(sendEvent(event, 59999)).resolves.toBeUndefined();
    });
});
