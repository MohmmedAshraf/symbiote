import http from 'node:http';
import type { SymbioteEvent } from './types.js';

export function sendEvent(event: SymbioteEvent, port: number): Promise<void> {
    return new Promise((resolve) => {
        const body = JSON.stringify(event);

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
                timeout: 1000,
            },
            () => resolve(),
        );

        req.on('error', () => resolve());
        req.on('timeout', () => {
            req.destroy();
            resolve();
        });

        req.write(body);
        req.end();
    });
}
