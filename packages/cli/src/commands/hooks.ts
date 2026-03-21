import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getProjectPort } from '#utils/config.js';

export async function cmdHookPre(): Promise<void> {
    process.stderr.write(
        '[symbiote] command hooks are deprecated, run symbiote install to upgrade to HTTP hooks\n',
    );
    const { readStdinPayload, writeResponse, fireHookEvent } = await import('#hooks/types.js');
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

            const response = await new Promise<{ decision: string; additionalContext?: string }>(
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
                additionalContext: response.additionalContext,
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

export async function cmdHookPost(): Promise<void> {
    process.stderr.write(
        '[symbiote] command hooks are deprecated, run symbiote install to upgrade to HTTP hooks\n',
    );
    const { readStdinPayload, writeResponse, fireHookEvent } = await import('#hooks/types.js');

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

export async function cmdHooksInstall(): Promise<void> {
    const { ensureClaudeHooks } = await import('#init/agent-connector.js');

    p.intro(pc.bold('Symbiote') + pc.dim(' — Installing Claude Code hooks'));

    const result = ensureClaudeHooks();
    if (result.success) {
        p.log.success('Registered all hook events in ~/.claude/settings.json');
    } else {
        p.log.error(`Failed to install hooks: ${result.message}`);
    }

    p.outro('Hooks installed. Symbiote will inject context on every tool call.');
}

export async function cmdHookSessionStart(): Promise<void> {
    const http = await import('node:http');

    const projectRoot = process.cwd();
    const port = getProjectPort(projectRoot);

    let source = 'startup';
    let sessionId = '';

    try {
        const raw = await new Promise<string>((resolve, reject) => {
            let data = '';
            process.stdin.setEncoding('utf-8');
            process.stdin.on('data', (chunk: string) => {
                data += chunk;
            });
            process.stdin.on('end', () => resolve(data));
            process.stdin.on('error', reject);
        });

        if (raw.trim()) {
            const payload = JSON.parse(raw) as Record<string, unknown>;
            if (typeof payload.source === 'string') source = payload.source;
            if (typeof payload.session_id === 'string') sessionId = payload.session_id;
        }
    } catch {
        // Proceed with defaults
    }

    const serverRunning = await new Promise<boolean>((resolve) => {
        const req = http.get(
            `http://127.0.0.1:${port}/internal/health`,
            { timeout: 2000 },
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
    });

    if (!serverRunning) {
        const fs = await import('node:fs');
        const dbPath = path.join(projectRoot, '.brain', 'symbiote.db');
        if (!fs.existsSync(dbPath)) {
            process.stdout.write('{}\n');
            return;
        }

        const { spawn } = await import('node:child_process');
        const child = spawn('npx', ['symbiote-cli', 'serve', '--port', String(port), '--no-open'], {
            cwd: projectRoot,
            detached: true,
            stdio: 'ignore',
        });
        child.unref();

        const waitForServer = async (maxMs: number): Promise<boolean> => {
            const start = Date.now();
            while (Date.now() - start < maxMs) {
                const up = await new Promise<boolean>((resolve) => {
                    const req = http.get(
                        `http://127.0.0.1:${port}/internal/health`,
                        { timeout: 500 },
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
                });
                if (up) return true;
                await new Promise((r) => setTimeout(r, 200));
            }
            return false;
        };

        const booted = await waitForServer(8000);
        if (!booted) {
            process.stdout.write('{}\n');
            return;
        }
    }

    const params = new URLSearchParams({ source, sessionId });
    const url = `http://127.0.0.1:${port}/internal/hooks/session-start?${params}`;

    const response = await new Promise<string>((resolve) => {
        const req = http.get(url, { timeout: 5000 }, (res) => {
            let data = '';
            res.on('data', (chunk: string) => {
                data += chunk;
            });
            res.on('end', () => resolve(data));
        });
        req.on('error', () => resolve('{}'));
        req.on('timeout', () => {
            req.destroy();
            resolve('{}');
        });
    });

    process.stdout.write(response + '\n');
}

export async function cmdHooksUninstall(): Promise<void> {
    const { disconnectClaudeHooks } = await import('#init/agent-connector.js');

    p.intro(pc.bold('Symbiote') + pc.dim(' — Uninstalling Claude Code hooks'));

    const result = disconnectClaudeHooks();
    if (result.success) {
        p.log.success('Removed all Symbiote hooks from ~/.claude/settings.json');
    } else {
        p.log.error(`Failed to remove hooks: ${result.message}`);
    }

    p.outro('Hooks uninstalled.');
}
