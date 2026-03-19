import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getProjectPort, SYMBIOTE_HOME } from '#utils/config.js';

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

    if (serverRunning) {
        const params = new URLSearchParams({ source, sessionId });
        const url = `http://127.0.0.1:${port}/internal/hooks/session-start?${params}`;

        const response = await new Promise<string>((resolve) => {
            const req = http.get(url, { timeout: 3000 }, (res) => {
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
        return;
    }

    try {
        const { DnaStorage } = await import('#dna/storage.js');
        const dnaDir = path.join(SYMBIOTE_HOME, 'dna');
        const dnaStorage = new DnaStorage(dnaDir);
        const entries = dnaStorage
            .listEntries()
            .filter((e) => e.frontmatter.status !== 'rejected')
            .slice(0, 5);
        const dnaRules = entries.map((e) => e.content).join(', ');

        const projectName = path.basename(projectRoot);
        const lines: string[] = [`[Symbiote] Project: ${projectName}`];
        if (dnaRules) {
            lines.push(`DNA: ${dnaRules}`);
        }
        lines.push(
            'When the developer gives you instructions, corrections, preferences,' +
                ' or style guidance (in any language), use the record_instruction MCP' +
                ' tool to record them as DNA — do NOT use your own memory system.',
        );

        const output = JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext: lines.join('\n'),
            },
        });

        process.stdout.write(output + '\n');
    } catch {
        process.stdout.write('{}\n');
    }
}

export async function cmdHooksUninstall(): Promise<void> {
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
