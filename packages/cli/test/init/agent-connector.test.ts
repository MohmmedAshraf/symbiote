import { describe, it, expect } from 'vitest';
import { detectInstalledAgents, isBonded } from '../../src/init/agent-connector.js';

describe('detectInstalledAgents', () => {
    it('returns a list of agents with installed status', () => {
        const agents = detectInstalledAgents();
        expect(agents.length).toBeGreaterThanOrEqual(5);
        expect(agents.every((a) => typeof a.installed === 'boolean')).toBe(true);
        expect(agents.every((a) => typeof a.name === 'string')).toBe(true);
    });

    it('detects Claude Code if installed', () => {
        const agents = detectInstalledAgents();
        const claude = agents.find((a) => a.id === 'claude-code');
        expect(claude).toBeDefined();
        expect(claude!.installed).toBe(true);
    });
});

describe('isBonded', () => {
    it('returns false for agent with nonexistent config', () => {
        const agent = {
            name: 'Windsurf',
            id: 'windsurf',
            installed: true,
            configPath: '/nonexistent/mcp.json',
            configType: 'json-file' as const,
        };
        expect(isBonded(agent)).toBe(false);
    });
});
