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

export function ensureClaudeHooks(): { success: boolean; message: string } {
    return installGlobalClaudeHooks();
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

        const hookEvents = ['SessionStart', 'PreToolUse', 'PostToolUse'];

        for (const eventName of hookEvents) {
            const existing: HookEntry[] = Array.isArray(hooks[eventName])
                ? (hooks[eventName] as HookEntry[])
                : [];

            const hasSymbiote = existing.some((h) =>
                h.hooks?.some((hh) => hh.command?.includes('symbiote-hook')),
            );

            if (!hasSymbiote) {
                existing.push({
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

            hooks[eventName] = existing;
        }
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

                for (const eventName of ['SessionStart', 'PreToolUse', 'PostToolUse']) {
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

const { spawn } = require("child_process");
const pathMod = require("path");
const http = require("http");
const fs = require("fs");

function allow() {
    process.stdout.write(JSON.stringify({ decision: "allow" }) + "\\n");
}

function readPort(cwd) {
    try {
        const portFile = pathMod.join(cwd, ".brain", "port");
        return parseInt(fs.readFileSync(portFile, "utf-8").trim(), 10) || 0;
    } catch { return 0; }
}

function httpGet(url, timeout) {
    return new Promise((resolve) => {
        const req = http.get(url, { timeout }, (res) => {
            let data = "";
            res.on("data", (c) => { data += c; });
            res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
        });
        req.on("error", () => resolve(null));
        req.on("timeout", () => { req.destroy(); resolve(null); });
    });
}

let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", async () => {
    try {
        const payload = JSON.parse(input);
        const cwd = payload.cwd || process.cwd();
        const brainDir = pathMod.join(cwd, ".brain");

        if (!fs.existsSync(brainDir)) { allow(); return; }

        const hookType = payload.type || payload.hook_event_name || "";

        if (hookType === "SessionStart" || hookType === "session_start") {
            const lines = [];
            lines.push("=== Symbiote Project Brain ===");

            const overviewPath = pathMod.join(brainDir, "intent", "overview.md");
            if (fs.existsSync(overviewPath)) {
                const overview = fs.readFileSync(overviewPath, "utf-8").trim();
                if (overview) {
                    lines.push("");
                    lines.push(overview);
                }
            }

            const homeDir = require("os").homedir();
            const dnaDir = pathMod.join(homeDir, ".symbiote", "dna");
            const indexPath = pathMod.join(dnaDir, "index.json");
            if (fs.existsSync(indexPath)) {
                try {
                    const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
                    const entries = Array.isArray(index) ? index : index.entries || [];
                    const approved = entries.filter(function(e) { return e.status === "approved"; });
                    if (approved.length > 0) {
                        lines.push("");
                        lines.push("Developer DNA (your coding style — follow these):");
                        approved.slice(0, 20).forEach(function(e) {
                            const entryPath = pathMod.join(dnaDir, e.category || "style", e.id + ".md");
                            if (fs.existsSync(entryPath)) {
                                const raw = fs.readFileSync(entryPath, "utf-8");
                                const contentMatch = raw.split("---").slice(2).join("---").trim();
                                if (contentMatch) {
                                    lines.push("  - [" + (e.category || "style") + "] " + contentMatch);
                                }
                            }
                        });
                    }
                } catch {}
            }

            const constraintsDir = pathMod.join(brainDir, "intent", "constraints");
            if (fs.existsSync(constraintsDir)) {
                const constraintFiles = fs.readdirSync(constraintsDir).filter(function(f) { return f.endsWith(".md"); });
                if (constraintFiles.length > 0) {
                    lines.push("");
                    lines.push("Project constraints (enforce these):");
                    constraintFiles.forEach(function(f) {
                        const raw = fs.readFileSync(pathMod.join(constraintsDir, f), "utf-8");
                        const content = raw.split("---").slice(2).join("---").trim();
                        if (content) lines.push("  - " + content);
                    });
                }
            }

            lines.push("");
            lines.push("Symbiote MCP tools available: get_developer_dna, query_graph, semantic_search, get_context_for_file, get_health, get_impact, detect_changes, get_constraints, get_decisions, propose_decision, propose_constraint, record_instruction");
            lines.push("Use these tools to query the project brain for deeper context when needed.");

            process.stdout.write(JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: "SessionStart",
                    additionalContext: lines.join("\\n"),
                }
            }) + "\\n");
            return;
        }

        const port = readPort(cwd);
        if (!port) { allow(); return; }

        const isPreHook = hookType === "pre_tool_use" || hookType === "PreToolUse";

        if (isPreHook) {
            const filePath = (payload.tool_input || {}).file_path;
            const toolName = payload.tool_name || "";
            const FILE_TOOLS = ["Read", "Edit", "Write"];

            if (filePath && FILE_TOOLS.indexOf(toolName) >= 0) {
                const params = "file=" + encodeURIComponent(filePath) + "&tool=" + encodeURIComponent(toolName) + "&root=" + encodeURIComponent(cwd);
                const result = await httpGet("http://127.0.0.1:" + port + "/internal/hook-context?" + params, 3000);
                if (result && result.additionalContext) {
                    process.stdout.write(JSON.stringify(result) + "\\n");
                    return;
                }
            }
            allow();
            return;
        }

        const isPostHook = hookType === "post_tool_use" || hookType === "PostToolUse";

        if (isPostHook) {
            const childPayload = {
                type: "post_tool_use",
                tool_name: payload.tool_name,
                tool_input: payload.tool_input || {},
                tool_output: payload.tool_output || "",
            };
            const child = spawn(
                "${cliPath}",
                ["hook", "post"],
                { cwd, stdio: ["pipe", "pipe", "ignore"] }
            );
            child.stdin.write(JSON.stringify(childPayload));
            child.stdin.end();
            let stdout = "";
            child.stdout.on("data", (c) => { stdout += c; });
            child.on("close", () => {
                if (stdout.trim()) { process.stdout.write(stdout); }
                else { allow(); }
            });
            child.on("error", () => { allow(); });
            setTimeout(() => { try { child.kill(); } catch {} allow(); }, 8000);
            return;
        }

        allow();
    } catch {
        allow();
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
