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

function getSkillSourceDir(): string {
    return path.resolve(__dirname, '../../../skills/symbiote-init');
}

function installSkill(): { success: boolean; message: string } {
    try {
        const skillSource = path.join(getSkillSourceDir(), 'SKILL.md');

        if (!fs.existsSync(skillSource)) {
            return { success: false, message: 'Skill source not found' };
        }

        const destDir = path.join(CLAUDE_SKILLS_DIR, 'symbiote-init');
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(skillSource, path.join(destDir, 'SKILL.md'));

        return { success: true, message: 'Skill installed' };
    } catch (err) {
        return {
            success: false,
            message: err instanceof Error ? err.message : 'Skill install failed',
        };
    }
}

export async function cmdInstall(): Promise<void> {
    const { ensureClaudeHooks } = await import('#init/agent-connector.js');

    p.intro(pc.bold('Symbiote') + pc.dim(' — Installing globally'));

    ensureSymbioteHome();

    const hooksResult = ensureClaudeHooks();
    if (hooksResult.success) {
        p.log.success('Hooks registered');
    } else {
        p.log.error(`Hooks failed: ${hooksResult.message}`);
    }

    const skillResult = installSkill();
    if (skillResult.success) {
        p.log.success('Skill /symbiote-init installed');
    } else {
        p.log.error(`Skill failed: ${skillResult.message}`);
    }

    p.outro(`Run ${pc.cyan('/symbiote-init')} in Claude Code to set up your project.`);
}
