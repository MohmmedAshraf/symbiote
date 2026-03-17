import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { runStage0 } from '../../src/cortex/stage-0-structure.js';
import { runStage1 } from '../../src/cortex/stage-1-symbols.js';
import { runStage2 } from '../../src/cortex/stage-2-resolution.js';

const SIMPLE = resolve(__dirname, '../fixtures/cortex/simple');
const BARREL = resolve(__dirname, '../fixtures/cortex/barrel');

describe('Stage 2: Resolution', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
    });

    afterEach(async () => {
        await db.close();
    });

    async function runStages(rootDir: string): Promise<void> {
        await runStage0(repo, rootDir);
        await runStage1(repo, rootDir);
    }

    it('creates import edges between files', async () => {
        await runStages(SIMPLE);
        await runStage2(repo, SIMPLE);
        const imports = await repo.getImportsFrom('file:service.ts');
        expect(imports.some((e) => e.targetId === 'file:utils.ts')).toBe(true);
    });

    it('captures named import metadata', async () => {
        await runStages(SIMPLE);
        await runStage2(repo, SIMPLE);
        const imports = await repo.getImportsFrom('file:service.ts');
        const utilImport = imports.find((e) => e.targetId === 'file:utils.ts');
        expect(utilImport!.kind).toBe('named');
        expect(utilImport!.originalName).toBe('validateEmail');
    });

    it('resolves re-export chains to true origin', async () => {
        await runStages(BARREL);
        const result = await runStage2(repo, BARREL);
        expect(result.filesProcessed).toBeGreaterThan(0);
        const symbolTable = await repo.getSymbolTable('file:index.ts');
        const capitalize = symbolTable?.get('capitalize');
        expect(capitalize).toBeDefined();
        expect(capitalize!.resolvedSourcePath).toContain('string.ts');
    });

    it('detects dynamic imports', async () => {
        await runStages(SIMPLE);
        await runStage2(repo, SIMPLE);
        const imports = await repo.getImportsFrom('file:service.ts');
        expect(imports.every((e) => e.kind !== 'dynamic')).toBe(true);
    });

    it('handles type-only imports', async () => {
        await runStages(SIMPLE);
        await runStage2(repo, SIMPLE);
        const imports = await repo.getImportsFrom('file:service.ts');
        const typeImport = imports.find((e) => e.originalName === 'User');
        expect(typeImport).toBeDefined();
    });

    it('resolves relative paths with extension fallback', async () => {
        await runStages(SIMPLE);
        await runStage2(repo, SIMPLE);
        const imports = await repo.getImportsFrom('file:service.ts');
        expect(imports.some((e) => e.targetId === 'file:utils.ts')).toBe(true);
    });

    it('builds symbol table per file', async () => {
        await runStages(SIMPLE);
        await runStage2(repo, SIMPLE);
        const symbolTable = await repo.getSymbolTable('file:service.ts');
        expect(symbolTable).toBeDefined();
        expect(symbolTable!.has('validateEmail')).toBe(true);
        expect(symbolTable!.get('validateEmail')!.resolvedSourcePath).toContain('utils.ts');
    });

    it('updates depth_level to 2', async () => {
        await runStages(SIMPLE);
        await runStage2(repo, SIMPLE);
        const file = await repo.getFileNode('file:service.ts');
        expect(file!.depthLevel).toBe(2);
    });
});
