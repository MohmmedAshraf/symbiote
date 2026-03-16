import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

export interface AgentInfo {
    name: string;
    id: string;
    installed: boolean;
    configPath: string;
    configType: 'cli-command' | 'json-file';
}

const CLAUDE_SETTINGS_PATH = path.join(homedir(), '.claude', 'settings.json');
const CLAUDE_HOOKS_DIR = path.join(homedir(), '.claude', 'hooks', 'symbiote');

const AGENTS: Omit<AgentInfo, 'installed'>[] = [
    {
        name: 'Claude Code',
        id: 'claude-code',
        configPath: '',
        configType: 'cli-command',
    },
    {
        name: 'Cursor',
        id: 'cursor',
        configPath: path.join(homedir(), '.cursor', 'mcp.json'),
        configType: 'json-file',
    },
    {
        name: 'Windsurf',
        id: 'windsurf',
        configPath: path.join(homedir(), '.windsurf', 'mcp.json'),
        configType: 'json-file',
    },
    {
        name: 'Copilot',
        id: 'copilot',
        configPath: path.join(homedir(), '.github', 'copilot', 'mcp.json'),
        configType: 'json-file',
    },
    {
        name: 'OpenCode',
        id: 'opencode',
        configPath: path.join(homedir(), '.config', 'opencode', 'config.json'),
        configType: 'json-file',
    },
];

export function detectInstalledAgents(): AgentInfo[] {
    return AGENTS.map((agent) => ({
        ...agent,
        installed: isAgentInstalled(agent),
    }));
}

function isAgentInstalled(agent: Omit<AgentInfo, 'installed'>): boolean {
    if (agent.id === 'claude-code') {
        try {
            execSync('which claude', { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    if (agent.configType === 'json-file') {
        const dir = path.dirname(agent.configPath);
        return fs.existsSync(dir);
    }

    return false;
}

export function connectAgent(agent: AgentInfo): {
    success: boolean;
    message: string;
} {
    try {
        if (agent.id === 'claude-code') {
            execSync('claude mcp add symbiote -- npx symbiote-cli mcp', { stdio: 'ignore' });
            return {
                success: true,
                message: 'MCP server added to Claude Code',
            };
        }

        if (agent.configType === 'json-file') {
            return writeJsonMcpConfig(agent);
        }

        return {
            success: false,
            message: 'Unknown agent type',
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

function writeJsonMcpConfig(agent: AgentInfo): {
    success: boolean;
    message: string;
} {
    const configPath = agent.configPath;
    const dir = path.dirname(configPath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch {
            config = {};
        }
    }

    const mcpServers = (config.mcpServers as Record<string, unknown>) ?? {};
    mcpServers.symbiote = {
        command: 'npx',
        args: ['symbiote-cli', 'mcp'],
    };
    config.mcpServers = mcpServers;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 4) + '\n');

    return {
        success: true,
        message: `MCP config written to ${configPath}`,
    };
}

export function isBonded(agent: AgentInfo): boolean {
    if (agent.id === 'claude-code') {
        try {
            const output = execSync('claude mcp list', { encoding: 'utf-8' });
            return output.includes('symbiote');
        } catch {
            return false;
        }
    }

    if (agent.configType === 'json-file' && fs.existsSync(agent.configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(agent.configPath, 'utf-8'));
            return !!config.mcpServers?.symbiote;
        } catch {
            return false;
        }
    }

    return false;
}

export function connectWithHooks(agent: AgentInfo): {
    mcp: { success: boolean; message: string };
    hooks: { success: boolean; message: string };
} {
    const mcp = connectAgent(agent);

    if (agent.id !== 'claude-code') {
        return { mcp, hooks: { success: true, message: 'Hooks not available' } };
    }

    const hooks = installGlobalClaudeHooks();
    return { mcp, hooks };
}

export function disconnectWithHooks(agent: AgentInfo): {
    mcp: { success: boolean; message: string };
    hooks: { success: boolean; message: string };
} {
    const mcp = disconnectAgent(agent);

    if (agent.id !== 'claude-code') {
        return { mcp, hooks: { success: true, message: 'No hooks to remove' } };
    }

    const hooks = removeGlobalClaudeHooks();
    return { mcp, hooks };
}

function installGlobalClaudeHooks(): { success: boolean; message: string } {
    try {
        fs.mkdirSync(CLAUDE_HOOKS_DIR, { recursive: true });

        const hookScript = buildHookScript();
        const hookScriptPath = path.join(CLAUDE_HOOKS_DIR, 'symbiote-hook.cjs');
        fs.writeFileSync(hookScriptPath, hookScript, { mode: 0o755 });

        const hookCommand = `node "${hookScriptPath}"`;

        let settings: Record<string, unknown> = {};
        if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
            try {
                settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
            } catch {
                settings = {};
            }
        }

        const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};

        interface HookEntry {
            matcher?: string;
            hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
        }

        const preHooks: HookEntry[] = Array.isArray(hooks.PreToolUse)
            ? (hooks.PreToolUse as HookEntry[])
            : [];
        const postHooks: HookEntry[] = Array.isArray(hooks.PostToolUse)
            ? (hooks.PostToolUse as HookEntry[])
            : [];

        const hasPreHook = preHooks.some((h) =>
            h.hooks?.some((hh) => hh.command?.includes('symbiote-hook')),
        );

        const hasPostHook = postHooks.some((h) =>
            h.hooks?.some((hh) => hh.command?.includes('symbiote-hook')),
        );

        if (!hasPreHook) {
            preHooks.push({
                matcher: '',
                hooks: [
                    {
                        type: 'command',
                        command: hookCommand,
                        timeout: 10,
                    },
                ],
            });
        }

        if (!hasPostHook) {
            postHooks.push({
                matcher: '',
                hooks: [
                    {
                        type: 'command',
                        command: hookCommand,
                        timeout: 10,
                    },
                ],
            });
        }

        hooks.PreToolUse = preHooks;
        hooks.PostToolUse = postHooks;
        settings.hooks = hooks;

        fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 4) + '\n');

        return { success: true, message: 'Hooks installed' };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : 'Hook install failed',
        };
    }
}

function removeGlobalClaudeHooks(): { success: boolean; message: string } {
    try {
        if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
            const settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
            const hooks = settings.hooks as Record<string, unknown[]> | undefined;

            if (hooks) {
                interface HookEntry {
                    hooks?: Array<{ command?: string }>;
                }

                for (const eventName of ['PreToolUse', 'PostToolUse']) {
                    if (Array.isArray(hooks[eventName])) {
                        hooks[eventName] = (hooks[eventName] as HookEntry[]).filter(
                            (h) => !h.hooks?.some((hh) => hh.command?.includes('symbiote-hook')),
                        );
                        if ((hooks[eventName] as unknown[]).length === 0) {
                            delete hooks[eventName];
                        }
                    }
                }

                if (Object.keys(hooks).length === 0) {
                    delete settings.hooks;
                }

                fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 4) + '\n');
            }
        }

        if (fs.existsSync(CLAUDE_HOOKS_DIR)) {
            fs.rmSync(CLAUDE_HOOKS_DIR, { recursive: true });
        }

        return { success: true, message: 'Hooks removed' };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : 'Hook removal failed',
        };
    }
}

function buildHookScript(): string {
    let cliPath: string;
    try {
        const resolved = execSync('which symbiote-cli', { encoding: 'utf-8' }).trim();
        cliPath = resolved;
    } catch {
        cliPath = 'npx symbiote-cli';
    }

    return `#!/usr/bin/env node
"use strict";

const { execSync, spawn } = require("child_process");
const path = require("path");
const http = require("http");

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
    try {
        const payload = JSON.parse(input);
        const cwd = payload.cwd || process.cwd();
        const brainDir = path.join(cwd, ".brain");
        const fs = require("fs");

        if (!fs.existsSync(brainDir)) {
            process.stdout.write(JSON.stringify({ decision: "allow" }) + "\\n");
            return;
        }

        const hookType = payload.type || payload.hook_event_name;
        const isPreHook = hookType === "pre_tool_use" || hookType === "PreToolUse";

        const childPayload = {
            type: isPreHook ? "pre_tool_use" : "post_tool_use",
            tool_name: payload.tool_name,
            tool_input: payload.tool_input || {},
            tool_output: payload.tool_output || "",
        };

        const subcommand = isPreHook ? "pre" : "post";
        const child = spawn(
            "${cliPath}",
            ["hook", subcommand],
            { cwd, stdio: ["pipe", "pipe", "ignore"] }
        );

        child.stdin.write(JSON.stringify(childPayload));
        child.stdin.end();

        let stdout = "";
        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.on("close", () => {
            if (stdout.trim()) {
                process.stdout.write(stdout);
            } else {
                process.stdout.write(JSON.stringify({ decision: "allow" }) + "\\n");
            }
        });

        child.on("error", () => {
            process.stdout.write(JSON.stringify({ decision: "allow" }) + "\\n");
        });

        setTimeout(() => {
            try { child.kill(); } catch {}
            process.stdout.write(JSON.stringify({ decision: "allow" }) + "\\n");
        }, 8000);
    } catch {
        process.stdout.write(JSON.stringify({ decision: "allow" }) + "\\n");
    }
});
`;
}

export function disconnectAgent(agent: AgentInfo): {
    success: boolean;
    message: string;
} {
    try {
        if (agent.id === 'claude-code') {
            execSync('claude mcp remove symbiote', {
                stdio: 'ignore',
            });
            return {
                success: true,
                message: 'Removed from Claude Code',
            };
        }

        if (agent.configType === 'json-file' && fs.existsSync(agent.configPath)) {
            const config = JSON.parse(fs.readFileSync(agent.configPath, 'utf-8'));
            const mcpServers = config.mcpServers ?? {};
            delete mcpServers.symbiote;
            config.mcpServers = mcpServers;
            fs.writeFileSync(agent.configPath, JSON.stringify(config, null, 4) + '\n');
            return {
                success: true,
                message: `Removed from ${agent.configPath}`,
            };
        }

        return {
            success: false,
            message: 'Config not found',
        };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}
