import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { ensureSymbioteHome } from '#utils/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_SKILLS_DIR = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? '',
    '.claude',
    'skills',
);

const SKILL_NAMES = ['symbiote-init', 'symbiote-scan', 'symbiote-impact', 'symbiote-dna'];

function installSkills(): { installed: string[]; failed: string[] } {
    const installed: string[] = [];
    const failed: string[] = [];

    for (const name of SKILL_NAMES) {
        const sourceDir = path.resolve(__dirname, `../../../skills/${name}`);
        const sourcePath = path.join(sourceDir, 'SKILL.md');

        if (!fs.existsSync(sourcePath)) {
            failed.push(name);
            continue;
        }

        try {
            const destDir = path.join(CLAUDE_SKILLS_DIR, name);
            fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(sourcePath, path.join(destDir, 'SKILL.md'));
            installed.push(name);
        } catch {
            failed.push(name);
        }
    }

    return { installed, failed };
}

export async function cmdInstall(): Promise<void> {
    const { ensureClaudeHooks, detectInstalledAgents, connectAgent } =
        await import('#init/agent-connector.js');

    p.intro(pc.bold('Symbiote') + pc.dim(' — Installing globally'));

    ensureSymbioteHome();

    const agents = detectInstalledAgents();
    const installed = agents.filter((a) => a.installed);

    for (const agent of installed) {
        const result = connectAgent(agent);
        if (result.success) {
            p.log.success(`${agent.name}: MCP registered`);
        } else {
            p.log.error(`${agent.name}: ${result.message}`);
        }
    }

    const hasClaude = installed.some((a) => a.id === 'claude-code');
    if (hasClaude) {
        const hooksResult = ensureClaudeHooks();
        if (hooksResult.success) {
            p.log.success('Claude Code: hooks registered');
        } else {
            p.log.error(`Claude Code hooks failed: ${hooksResult.message}`);
        }

        const skillResult = installSkills();
        if (skillResult.installed.length > 0) {
            const names = skillResult.installed.map((n) => `/${n}`).join(', ');
            p.log.success(`Claude Code: skills installed (${names})`);
        }
        if (skillResult.failed.length > 0) {
            p.log.error(`Skills failed: ${skillResult.failed.join(', ')}`);
        }
    }

    if (installed.length === 0) {
        p.log.warn('No supported AI editors detected');
    }

    p.outro(`Run ${pc.cyan('/symbiote-init')} in Claude Code to set up your project.`);
}
