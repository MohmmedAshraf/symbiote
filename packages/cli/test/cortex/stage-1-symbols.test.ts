import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { runStage0 } from '../../src/cortex/stage-0-structure.js';
import { runStage1 } from '../../src/cortex/stage-1-symbols.js';

const SIMPLE = resolve(__dirname, '../fixtures/cortex/simple');
const CALLGRAPH = resolve(__dirname, '../fixtures/cortex/callgraph');

describe('Stage 1: Symbols', () => {
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

    it('extracts functions from TypeScript files', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const fns = await repo.getFunctionsByFile('utils.ts');
        expect(fns.some((f) => f.name === 'validateEmail')).toBe(true);
    });

    it('extracts classes', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const classes = await repo.getClassesByFile('service.ts');
        expect(classes.some((c) => c.name === 'UserService')).toBe(true);
    });

    it('extracts methods with qualified names', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const methods = await repo.getMethodsByFile('service.ts');
        expect(methods.some((m) => m.qualifiedName === 'UserService.create')).toBe(true);
        expect(methods.some((m) => m.qualifiedName === 'UserService.findById')).toBe(true);
    });

    it('extracts interfaces', async () => {
        await runStage0(repo, CALLGRAPH);
        await runStage1(repo, CALLGRAPH);
        const ifaces = await repo.getInterfacesByFile('types.ts');
        expect(ifaces.some((i) => i.name === 'IUserService')).toBe(true);
    });

    it('extracts type aliases', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const types = await repo.getTypesByFile('types.ts');
        expect(types.some((t) => t.name === 'UserRole')).toBe(true);
    });

    it('marks exported symbols', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const fns = await repo.getFunctionsByFile('utils.ts');
        const validate = fns.find((f) => f.name === 'validateEmail');
        expect(validate!.isExported).toBe(true);
    });

    it('marks async methods', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const methods = await repo.getMethodsByFile('service.ts');
        const create = methods.find((m) => m.name === 'create');
        expect(create!.isAsync).toBe(true);
    });

    it('extracts exported variables', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const vars = await repo.getVariablesByFile('utils.ts');
        expect(vars.some((v) => v.name === 'MAX_RETRIES')).toBe(true);
    });

    it('creates contains edges from file to symbols', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const contained = await repo.getContainedBy('file:utils.ts');
        expect(contained.length).toBeGreaterThanOrEqual(2);
    });

    it('creates implements edges for class inheritance', async () => {
        await runStage0(repo, CALLGRAPH);
        await runStage1(repo, CALLGRAPH);
        const impls = await repo.getImplementsFrom('class:service.ts:UserService');
        expect(impls.some((e) => e.targetId.includes('IUserService'))).toBe(true);
    });

    it('captures function signatures', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const fns = await repo.getFunctionsByFile('utils.ts');
        const validate = fns.find((f) => f.name === 'validateEmail');
        expect(validate!.signature).toContain('email');
    });

    it('updates depth_level to 1', async () => {
        await runStage0(repo, SIMPLE);
        await runStage1(repo, SIMPLE);
        const file = await repo.getFileNode('file:utils.ts');
        expect(file!.depthLevel).toBe(1);
    });

    it('only processes files at depth_level < 1', async () => {
        await runStage0(repo, SIMPLE);
        const first = await runStage1(repo, SIMPLE);
        const second = await runStage1(repo, SIMPLE);
        expect(first.filesProcessed).toBe(4);
        expect(second.filesProcessed).toBe(0);
    });
});
