import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { walkFiles, hashFileContent } from '../../src/utils/files.js';

const FIXTURES = path.join(import.meta.dirname, '../fixtures');

describe('walkFiles', () => {
    it('finds all source files in a project', async () => {
        const files = await walkFiles(path.join(FIXTURES, 'simple-project'));
        expect(files.length).toBeGreaterThanOrEqual(3);
        expect(files.some((f) => f.endsWith('index.js'))).toBe(true);
        expect(files.some((f) => f.endsWith('utils.js'))).toBe(true);
        expect(files.some((f) => f.endsWith('math.js'))).toBe(true);
    });

    it('skips node_modules and .git directories', async () => {
        const files = await walkFiles(path.join(FIXTURES, 'simple-project'));
        expect(files.every((f) => !f.includes('node_modules'))).toBe(true);
        expect(files.every((f) => !f.includes('.git'))).toBe(true);
    });

    it('only returns files with supported language extensions', async () => {
        const files = await walkFiles(path.join(FIXTURES, 'simple-project'));
        expect(files.every((f) => f.endsWith('.js') || f.endsWith('.ts'))).toBe(true);
    });
});

describe('hashFileContent', () => {
    it('returns a consistent hash for the same file', () => {
        const filePath = path.join(FIXTURES, 'simple-project/index.js');
        const hash1 = hashFileContent(filePath);
        const hash2 = hashFileContent(filePath);
        expect(hash1).toBe(hash2);
    });

    it('returns a 16-character hex string', () => {
        const filePath = path.join(FIXTURES, 'simple-project/index.js');
        const hash = hashFileContent(filePath);
        expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('returns different hashes for different files', () => {
        const hash1 = hashFileContent(path.join(FIXTURES, 'simple-project/index.js'));
        const hash2 = hashFileContent(path.join(FIXTURES, 'simple-project/utils.js'));
        expect(hash1).not.toBe(hash2);
    });
});
