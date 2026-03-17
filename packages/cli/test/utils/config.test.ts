import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureBrainDir, getBrainDbPath } from '#utils/config.js';

describe('ensureBrainDir', () => {
    const tmpDir = path.join(os.tmpdir(), `symbiote-test-${Date.now()}`);

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('creates .brain directory structure', () => {
        fs.mkdirSync(tmpDir, { recursive: true });
        const brainDir = ensureBrainDir(tmpDir);

        expect(fs.existsSync(brainDir)).toBe(true);
        expect(fs.existsSync(path.join(brainDir, 'config.json'))).toBe(true);
        expect(fs.existsSync(path.join(brainDir, '.gitignore'))).toBe(true);
        expect(fs.existsSync(path.join(brainDir, 'intent', 'decisions'))).toBe(true);
        expect(fs.existsSync(path.join(brainDir, 'intent', 'constraints'))).toBe(true);
    });

    it('is idempotent', () => {
        fs.mkdirSync(tmpDir, { recursive: true });
        ensureBrainDir(tmpDir);
        expect(() => ensureBrainDir(tmpDir)).not.toThrow();
    });
});

describe('getBrainDbPath', () => {
    it('returns the correct path', () => {
        const dbPath = getBrainDbPath('/my/project');
        expect(dbPath).toBe('/my/project/.brain/symbiote.db');
    });
});
