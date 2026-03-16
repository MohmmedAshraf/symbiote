import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { fireHookEvent } from '../../src/hooks/types.js';
import type { SymbioteEvent } from '../../src/events/types.js';

describe('Hook IPC', () => {
    let server: http.Server;

    afterEach(() => {
        if (server) server.close();
    });

    it('sends file:read event from hook to server', async () => {
        const receivedEvents: SymbioteEvent[] = [];
        server = http.createServer((req, res) => {
            let data = '';
            req.on('data', (chunk) => {
                data += chunk;
            });
            req.on('end', () => {
                receivedEvents.push(JSON.parse(data));
                res.writeHead(200);
                res.end();
            });
        });

        await new Promise<void>((resolve) => server.listen(0, resolve));
        const port = (server.address() as { port: number }).port;

        await fireHookEvent('file:read', { filePath: 'src/auth.ts', toolName: 'Read' }, port);

        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0].type).toBe('file:read');
        expect(receivedEvents[0].data.filePath).toBe('src/auth.ts');
    });

    it('does not throw when server is unreachable', async () => {
        await expect(
            fireHookEvent('file:edit', { filePath: 'src/auth.ts' }, 59999),
        ).resolves.toBeUndefined();
    });
});
