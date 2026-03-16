import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SmartInit } from '../../src/init/index.js';
import type { ScanResult } from '../../src/core/scanner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, '../fixtures/init-project');

function makeTmpDirs(): { symbioteHome: string; brainDir: string; cleanup: () => void } {
    const symbioteHome = mkdtempSync(join(tmpdir(), 'symbiote-home-'));
    const brainDir = mkdtempSync(join(tmpdir(), 'symbiote-brain-'));
    return {
        symbioteHome,
        brainDir,
        cleanup: () => {
            rmSync(symbioteHome, { recursive: true, force: true });
            rmSync(brainDir, { recursive: true, force: true });
        },
    };
}

const scanResult: ScanResult = {
    filesScanned: 10,
    filesSkipped: 2,
    nodesCreated: 50,
    edgesCreated: 30,
    errors: [],
};

describe('SmartInit', () => {
    it('runs all steps and returns a summary', () => {
        const { symbioteHome, brainDir, cleanup } = makeTmpDirs();
        try {
            const init = new SmartInit({
                projectRoot: FIXTURE_DIR,
                symbioteHome,
                brainDir,
                scanResult,
            });
            const result = init.run();

            expect(result.rulesImported).toBeGreaterThan(0);
            expect(result.techStack.length).toBeGreaterThan(0);
            expect(result.entryPoints.length).toBeGreaterThan(0);
            expect(result.overviewGenerated).toBe(true);
        } finally {
            cleanup();
        }
    });

    it('writes overview.md to brain directory', () => {
        const { symbioteHome, brainDir, cleanup } = makeTmpDirs();
        try {
            const init = new SmartInit({
                projectRoot: FIXTURE_DIR,
                symbioteHome,
                brainDir,
                scanResult,
            });
            init.run();

            const overviewPath = join(brainDir, 'intent', 'overview.md');
            expect(existsSync(overviewPath)).toBe(true);

            const content = readFileSync(overviewPath, 'utf-8');
            expect(content).toContain('# init-project');
            expect(content).toContain('## Tech Stack');
        } finally {
            cleanup();
        }
    });

    it('creates constraint intent entries', () => {
        const { symbioteHome, brainDir, cleanup } = makeTmpDirs();
        try {
            const init = new SmartInit({
                projectRoot: FIXTURE_DIR,
                symbioteHome,
                brainDir,
                scanResult,
            });
            const result = init.run();

            expect(result.intentEntriesCreated).toBeGreaterThan(0);

            const constraintsDir = join(brainDir, 'intent', 'constraints');
            expect(existsSync(constraintsDir)).toBe(true);
        } finally {
            cleanup();
        }
    });

    it('imports DNA entries', () => {
        const { symbioteHome, brainDir, cleanup } = makeTmpDirs();
        try {
            const init = new SmartInit({
                projectRoot: FIXTURE_DIR,
                symbioteHome,
                brainDir,
                scanResult,
            });
            const result = init.run();

            expect(result.dnaEntriesImported).toBeGreaterThan(0);
        } finally {
            cleanup();
        }
    });
});
