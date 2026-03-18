import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { getProjectPort } from '#utils/config.js';

export interface AgentInfo {
    name: string;
    id: string;
    installed: boolean;
    configPath: string;
    configType: 'cli-command' | 'json-file';
    configKey: 'mcpServers' | 'mcp';
}

const CLAUDE_SETTINGS_PATH = path.join(homedir(), '.claude', 'settings.json');
const CLAUDE_HOOKS_DIR = path.join(homedir(), '.claude', 'hooks', 'symbiote');

const AGENTS: Omit<AgentInfo, 'installed'>[] = [
    {
        name: 'Claude Code',
        id: 'claude-code',
        configPath: '',
        configType: 'cli-command',
        configKey: 'mcpServers',
    },
    {
        name: 'Cursor',
        id: 'cursor',
        configPath: path.join(homedir(), '.cursor', 'mcp.json'),
        configType: 'json-file',
        configKey: 'mcpServers',
    },
    {
        name: 'Windsurf',
        id: 'windsurf',
        configPath: path.join(homedir(), '.windsurf', 'mcp.json'),
        configType: 'json-file',
        configKey: 'mcpServers',
    },
    {
        name: 'Copilot',
        id: 'copilot',
        configPath: path.join(homedir(), '.github', 'copilot', 'mcp.json'),
        configType: 'json-file',
        configKey: 'mcpServers',
    },
    {
        name: 'OpenCode',
        id: 'opencode',
        configPath: path.join(homedir(), '.config', 'opencode', '.opencode.json'),
        configType: 'json-file',
        configKey: 'mcpServers',
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
            try {
                execSync('claude mcp remove symbiote', { stdio: 'ignore' });
            } catch {
                // not registered yet
            }
            execSync('claude mcp add symbiote -- npx -y symbiote-cli mcp', { stdio: 'ignore' });
            return {
                success: true,
                message: 'MCP server added to Claude Code (stdio)',
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

    const key = agent.configKey;
    const servers = (config[key] as Record<string, unknown>) ?? {};
    servers.symbiote = {
        command: 'npx',
        args: ['-y', 'symbiote-cli', 'mcp'],
    };
    config[key] = servers;

    const tmpPath = configPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 4) + '\n');
    fs.renameSync(tmpPath, configPath);

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
            const servers = config[agent.configKey] as Record<string, unknown> | undefined;
            return !!servers?.symbiote;
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

const HOOK_EVENTS = [
    'SessionStart',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'SubagentStart',
    'PreCompact',
    'Stop',
    'SessionEnd',
];

function installGlobalClaudeHooks(): { success: boolean; message: string } {
    try {
        if (fs.existsSync(CLAUDE_HOOKS_DIR)) {
            fs.rmSync(CLAUDE_HOOKS_DIR, { recursive: true });
        }

        let settings: Record<string, unknown> = {};
        if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
            try {
                settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
            } catch {
                settings = {};
            }
        }

        const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};

        interface AnyHookEntry {
            hooks?: Array<{ command?: string; url?: string; type?: string }>;
        }

        for (const eventName of HOOK_EVENTS) {
            if (Array.isArray(hooks[eventName])) {
                hooks[eventName] = (hooks[eventName] as AnyHookEntry[]).filter(
                    (h) =>
                        !h.hooks?.some(
                            (hh) =>
                                hh.command?.includes('symbiote') ||
                                hh.url?.includes('localhost') ||
                                hh.url?.includes('/internal/hooks/'),
                        ),
                );
                if ((hooks[eventName] as unknown[]).length === 0) {
                    delete hooks[eventName];
                }
            }
        }

        const port = getProjectPort(process.cwd());
        const base = `http://localhost:${port}/internal/hooks`;

        hooks['SessionStart'] = [
            {
                matcher: 'startup|compact',
                hooks: [
                    {
                        type: 'command',
                        command: 'npx symbiote-cli hook session-start',
                        timeout: 30,
                    },
                ],
            },
        ];

        hooks['UserPromptSubmit'] = [
            {
                hooks: [
                    {
                        type: 'prompt',
                        prompt: 'Analyze if this message contains a coding correction or preference. Message: $ARGUMENTS\nRespond JSON only: {"is_instruction":boolean,"type":"correction|preference|reinforcement|none","instruction":"extracted or null","anti_pattern":"what to avoid or null"}',
                        model: 'claude-haiku-4-5-20251001',
                    },
                    {
                        type: 'http',
                        url: `${base}/user-prompt-submit`,
                    },
                ],
            },
        ];

        hooks['PreToolUse'] = [
            { matcher: '*', hooks: [{ type: 'http', url: `${base}/pre-tool-use` }] },
        ];
        hooks['PostToolUse'] = [
            { matcher: '*', hooks: [{ type: 'http', url: `${base}/post-tool-use` }] },
        ];
        hooks['PostToolUseFailure'] = [
            {
                matcher: '*',
                hooks: [{ type: 'http', url: `${base}/post-tool-use-failure` }],
            },
        ];
        hooks['SubagentStart'] = [{ hooks: [{ type: 'http', url: `${base}/subagent-start` }] }];
        hooks['PreCompact'] = [
            {
                matcher: 'manual|auto',
                hooks: [{ type: 'http', url: `${base}/pre-compact` }],
            },
        ];
        hooks['Stop'] = [{ hooks: [{ type: 'http', url: `${base}/stop` }] }];
        hooks['SessionEnd'] = [{ hooks: [{ type: 'http', url: `${base}/session-end` }] }];

        settings.hooks = hooks;
        const tmpSettings = CLAUDE_SETTINGS_PATH + '.tmp';
        fs.writeFileSync(tmpSettings, JSON.stringify(settings, null, 4) + '\n');
        fs.renameSync(tmpSettings, CLAUDE_SETTINGS_PATH);

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
                    hooks?: Array<{ command?: string; url?: string }>;
                }

                for (const eventName of HOOK_EVENTS) {
                    if (Array.isArray(hooks[eventName])) {
                        hooks[eventName] = (hooks[eventName] as HookEntry[]).filter(
                            (h) =>
                                !h.hooks?.some(
                                    (hh) =>
                                        hh.command?.includes('symbiote') ||
                                        hh.url?.includes('/internal/hooks/'),
                                ),
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

export function disconnectAgent(agent: AgentInfo): {
    success: boolean;
    message: string;
} {
    try {
        if (agent.id === 'claude-code') {
            try {
                execSync('claude mcp remove symbiote', { stdio: 'ignore' });
            } catch {
                // already removed
            }
            return {
                success: true,
                message: 'Removed from Claude Code',
            };
        }

        if (agent.configType === 'json-file' && fs.existsSync(agent.configPath)) {
            const config = JSON.parse(fs.readFileSync(agent.configPath, 'utf-8'));
            const key = agent.configKey;
            const servers = config[key] ?? {};
            delete servers.symbiote;
            config[key] = servers;
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
