import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('symbiote install', () => {
    it('has the skill source bundled in the package', () => {
        const skillPath = resolve(__dirname, '../../skills/symbiote-init/SKILL.md');
        expect(existsSync(skillPath)).toBe(true);
    });

    it('skill source contains valid frontmatter', async () => {
        const { readFileSync } = await import('node:fs');
        const skillPath = resolve(__dirname, '../../skills/symbiote-init/SKILL.md');
        const content = readFileSync(skillPath, 'utf-8');
        expect(content).toContain('name: symbiote-init');
        expect(content).toContain('description:');
    });
});
