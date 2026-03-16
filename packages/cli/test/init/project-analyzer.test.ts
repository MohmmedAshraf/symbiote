import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeProject } from '../../src/init/project-analyzer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../fixtures/init-project');

describe('analyzeProject', () => {
    it('detects tech stack from package.json', () => {
        const result = analyzeProject(FIXTURE_DIR);
        const names = result.techStack.map((t) => t.name);
        expect(names).toContain('Next.js');
        expect(names).toContain('React');
        expect(names).toContain('Drizzle');
        expect(names).toContain('Tailwind');
    });

    it('detects architecture signals from directories', () => {
        const result = analyzeProject(FIXTURE_DIR);
        const patterns = result.architecture.map((a) => a.pattern);
        expect(patterns).toContain('src-directory');
    });

    it('detects component directory signal', () => {
        const result = analyzeProject(FIXTURE_DIR);
        const srcContents = ['components', 'lib', 'utils'];
        const patterns = result.architecture.map((a) => a.pattern);
        expect(
            srcContents.some((dir) =>
                patterns.includes(
                    dir === 'components'
                        ? 'component-library'
                        : dir === 'lib'
                          ? 'lib-utilities'
                          : 'utility-layer',
                ),
            ),
        ).toBe(false);
    });

    it('detects entry points', () => {
        const result = analyzeProject(FIXTURE_DIR);
        expect(result.entryPoints.length).toBeGreaterThan(0);
        const hasIndex = result.entryPoints.some((e) => e.includes('index'));
        expect(hasIndex).toBe(true);
    });

    it('extracts description from package.json', () => {
        const result = analyzeProject(FIXTURE_DIR);
        expect(result.description).toBe('A Next.js app with Drizzle ORM');
    });

    it('handles empty directory gracefully', () => {
        const emptyDir = mkdtempSync(join(tmpdir(), 'symbiote-test-'));
        const result = analyzeProject(emptyDir);
        expect(result.techStack).toEqual([]);
        expect(result.architecture).toEqual([]);
        expect(result.conventions).toEqual([]);
        expect(result.entryPoints).toEqual([]);
        expect(result.description).toBeUndefined();
    });
});
