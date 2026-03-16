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

export function connectWithHooks(
    agent: AgentInfo,
    projectRoot: string,
): {
    mcp: { success: boolean; message: string };
    hooks: { success: boolean; message: string };
} {
    const mcp = connectAgent(agent);

    if (agent.id !== 'claude-code') {
        return { mcp, hooks: { success: true, message: 'Hooks not available' } };
    }

    const hooks = writeClaudeHooks(projectRoot);
    return { mcp, hooks };
}

export function disconnectWithHooks(
    agent: AgentInfo,
    projectRoot: string,
): {
    mcp: { success: boolean; message: string };
    hooks: { success: boolean; message: string };
} {
    const mcp = disconnectAgent(agent);

    if (agent.id !== 'claude-code') {
        return { mcp, hooks: { success: true, message: 'No hooks to remove' } };
    }

    const hooks = removeClaudeHooks(projectRoot);
    return { mcp, hooks };
}

function writeClaudeHooks(projectRoot: string): { success: boolean; message: string } {
    try {
        const claudeDir = path.join(projectRoot, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });

        const settingsPath = path.join(claudeDir, 'settings.local.json');
        let settings: Record<string, unknown> = {};

        if (fs.existsSync(settingsPath)) {
            try {
                settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
            } catch {
                settings = {};
            }
        }

        const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};

        hooks.PreToolUse = [
            {
                matcher: '',
                hooks: [{ type: 'command', command: 'npx symbiote-cli hook pre' }],
            },
        ];

        hooks.PostToolUse = [
            {
                matcher: '',
                hooks: [{ type: 'command', command: 'npx symbiote-cli hook post' }],
            },
        ];

        settings.hooks = hooks;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4) + '\n');

        return { success: true, message: 'Hooks installed' };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : 'Hook install failed',
        };
    }
}

function removeClaudeHooks(projectRoot: string): { success: boolean; message: string } {
    try {
        const settingsPath = path.join(projectRoot, '.claude', 'settings.local.json');

        if (!fs.existsSync(settingsPath)) {
            return { success: true, message: 'No hooks to remove' };
        }

        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const hooks = settings.hooks as Record<string, unknown[]> | undefined;

        if (hooks) {
            delete hooks.PreToolUse;
            delete hooks.PostToolUse;

            if (Object.keys(hooks).length === 0) {
                delete settings.hooks;
            }
        }

        if (Object.keys(settings).length === 0) {
            fs.unlinkSync(settingsPath);
        } else {
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4) + '\n');
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
