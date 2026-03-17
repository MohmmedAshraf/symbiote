import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { createDatabase, SymbioteDB } from '#storage/db.js';
import { createCortexSchema } from '#cortex/schema.js';
import { CortexRepository } from '#cortex/repository.js';
import { CortexEngine } from '#cortex/engine.js';
import { handleRenameSymbol } from '#mcp/tools/rename-tool.js';
import type { RenameChange, RenameResult, RenameError } from '#mcp/tools/rename-tool.js';

const FIXTURES = resolve(__dirname, '../../fixtures/cortex/simple');

describe('Rename Tool', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        const engine = new CortexEngine(repo);
        await engine.run({ rootDir: FIXTURES });
    });

    afterEach(async () => {
        await db.close();
    });

    it('returns error when symbol not found', async () => {
        const result = await handleRenameSymbol(
            { cortexRepo: repo, rootDir: FIXTURES },
            { symbol: 'nonExistentSymbol', newName: 'whatever' },
        );

        const data = result.data as RenameError;
        expect(data.error).toContain('nonExistentSymbol');
        expect(data.error).toContain('not found');
    });

    it('returns preview changes for validateEmail rename', async () => {
        const result = await handleRenameSymbol(
            { cortexRepo: repo, rootDir: FIXTURES },
            { symbol: 'validateEmail', newName: 'isEmailValid' },
        );

        const data = result.data as RenameResult;
        expect(data.changes).toBeDefined();
        expect(data.changes.length).toBeGreaterThan(0);

        const defChange = data.changes.find(
            (c) => c.file.endsWith('utils.ts') && c.oldText.includes('validateEmail'),
        );
        expect(defChange).toBeDefined();
        expect(defChange!.newText).toContain('isEmailValid');
        expect(defChange!.newText).not.toContain('validateEmail');
    });

    it('does not modify files on disk', async () => {
        const utilsBefore = readFileSync(resolve(FIXTURES, 'utils.ts'), 'utf-8');
        const serviceBefore = readFileSync(resolve(FIXTURES, 'service.ts'), 'utf-8');

        await handleRenameSymbol(
            { cortexRepo: repo, rootDir: FIXTURES },
            { symbol: 'validateEmail', newName: 'isEmailValid' },
        );

        const utilsAfter = readFileSync(resolve(FIXTURES, 'utils.ts'), 'utf-8');
        const serviceAfter = readFileSync(resolve(FIXTURES, 'service.ts'), 'utf-8');

        expect(utilsAfter).toBe(utilsBefore);
        expect(serviceAfter).toBe(serviceBefore);
    });

    it('includes depth and deepening in response', async () => {
        const result = await handleRenameSymbol(
            { cortexRepo: repo, rootDir: FIXTURES },
            { symbol: 'validateEmail', newName: 'isEmailValid' },
        );

        expect(typeof result.depth).toBe('number');
        expect(typeof result.deepening).toBe('boolean');
        expect(result.deepening).toBe(false);
    });

    it('includes import-site changes across files', async () => {
        const result = await handleRenameSymbol(
            { cortexRepo: repo, rootDir: FIXTURES },
            { symbol: 'validateEmail', newName: 'isEmailValid' },
        );

        const data = result.data as RenameResult;
        const affectedFiles = new Set(data.changes.map((c) => c.file));
        expect(affectedFiles.size).toBeGreaterThanOrEqual(2);
    });
});
