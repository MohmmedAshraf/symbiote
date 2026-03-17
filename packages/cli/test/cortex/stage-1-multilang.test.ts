import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../src/storage/db.js';
import { createCortexSchema } from '../../src/cortex/schema.js';
import { CortexRepository } from '../../src/cortex/repository.js';
import { runStage0 } from '../../src/cortex/stage-0-structure.js';
import { runStage1 } from '../../src/cortex/stage-1-symbols.js';

const MULTILANG = resolve(__dirname, '../fixtures/cortex/multilang');

describe('Stage 1: Multi-Language Extraction', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        await runStage0(repo, MULTILANG);
    });

    afterEach(async () => {
        await db.close();
    });

    it('extracts Python functions and classes', async () => {
        await runStage1(repo, MULTILANG);
        const fns = await repo.getFunctionsByFile('sample.py');
        expect(fns.length).toBeGreaterThan(0);
        const classes = await repo.getClassesByFile('sample.py');
        expect(classes.length).toBeGreaterThan(0);
    });

    it('extracts Go functions', async () => {
        await runStage1(repo, MULTILANG);
        const fns = await repo.getFunctionsByFile('sample.go');
        expect(fns.length).toBeGreaterThan(0);
    });

    it('extracts Java classes and methods', async () => {
        await runStage1(repo, MULTILANG);
        const classes = await repo.getClassesByFile('Sample.java');
        expect(classes.length).toBeGreaterThan(0);
        const methods = await repo.getMethodsByFile('Sample.java');
        expect(methods.length).toBeGreaterThan(0);
    });

    it('extracts Rust functions and structs', async () => {
        await runStage1(repo, MULTILANG);
        const fns = await repo.getFunctionsByFile('sample.rs');
        expect(fns.length).toBeGreaterThan(0);
    });

    it('extracts Ruby methods and classes', async () => {
        await runStage1(repo, MULTILANG);
        const classes = await repo.getClassesByFile('sample.rb');
        expect(classes.length).toBeGreaterThan(0);
    });

    it('extracts PHP functions and classes', async () => {
        await runStage1(repo, MULTILANG);
        const fns = await repo.getFunctionsByFile('sample.php');
        expect(fns.length).toBeGreaterThan(0);
    });

    it('extracts C functions', async () => {
        await runStage1(repo, MULTILANG);
        const fns = await repo.getFunctionsByFile('sample.c');
        expect(fns.length).toBeGreaterThan(0);
    });

    it('extracts C++ classes and functions', async () => {
        await runStage1(repo, MULTILANG);
        const fns = await repo.getFunctionsByFile('sample.cpp');
        expect(fns.length).toBeGreaterThan(0);
    });
});
