import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { getProjectPort } from '../utils/config.js';

export async function cmdHookPre(): Promise<void> {
    const { readStdinPayload, writeResponse, fireHookEvent } = await import('../hooks/types.js');
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
    const { readStdinPayload, writeResponse, fireHookEvent } = await import('../hooks/types.js');

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
