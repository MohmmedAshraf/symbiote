import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { EventBus } from '../../src/events/bus.js';
import { createEvent } from '../../src/events/types.js';
import { handleInternalEvent, handleSseConnection } from '../../src/mcp/http-api.js';

describe('SSE + Internal Events', () => {
    let server: http.Server;
    let port: number;
    let bus: EventBus;

    beforeAll(async () => {
        bus = new EventBus();
        server = http.createServer((req, res) => {
            const url = new URL(req.url ?? '/', `http://localhost`);
            if (url.pathname === '/internal/events' && req.method === 'POST') {
                handleInternalEvent(bus, req, res);
                return;
            }
            if (url.pathname === '/events' && req.method === 'GET') {
                handleSseConnection(bus, req, res);
                return;
            }
            res.writeHead(404);
            res.end();
        });
        await new Promise<void>((resolve) => server.listen(0, resolve));
        port = (server.address() as { port: number }).port;
    });

    afterAll(() => server.close());

    it('receives events via SSE when internal endpoint is POSTed', async () => {
        const received: string[] = [];

        const sseReq = http.get(`http://127.0.0.1:${port}/events`, (res) => {
            res.on('data', (chunk) => {
                received.push(chunk.toString());
            });
        });

        await new Promise((r) => setTimeout(r, 50));

        const event = createEvent('file:read', {
            filePath: 'src/auth.ts',
        });
        const body = JSON.stringify(event);

        await new Promise<void>((resolve) => {
            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port,
                    path: '/internal/events',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body),
                    },
                },
                () => resolve(),
            );
            req.write(body);
            req.end();
        });

        await new Promise((r) => setTimeout(r, 50));
        sseReq.destroy();

        const joined = received.join('');
        expect(joined).toContain('file:read');
        expect(joined).toContain('src/auth.ts');
    });
});
