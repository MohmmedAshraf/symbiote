import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { Scanner } from '#core/scanner.js';
import { createServerContext, type ServerContext } from '#mcp/context.js';
import { handleGetHealth } from '#mcp/tools/health-tools.js';

const FIXTURES_SRC = path.join(import.meta.dirname, '../../fixtures/brain-project/src');
const FIXTURES_BRAIN = path.join(import.meta.dirname, '../../fixtures/brain-project/.brain');

describe('Health Tools', () => {
    let db: SymbioteDB;
    let ctx: ServerContext;
    let tmpHome: string;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        tmpHome = path.join(os.tmpdir(), `symbiote-mcp-health-${Date.now()}`);
        fs.mkdirSync(path.join(tmpHome, 'dna', 'style'), {
            recursive: true,
        });
        fs.mkdirSync(path.join(tmpHome, 'dna', 'preferences'), {
            recursive: true,
        });
        fs.mkdirSync(path.join(tmpHome, 'dna', 'anti-patterns'), {
            recursive: true,
        });
        fs.mkdirSync(path.join(tmpHome, 'dna', 'decisions'), {
            recursive: true,
        });
        fs.writeFileSync(
            path.join(tmpHome, 'dna', 'index.json'),
            JSON.stringify({ version: 1, entries: [] }),
        );

        ctx = await createServerContext({
            db,
            rootDir: process.cwd(),
            brainDir: FIXTURES_BRAIN,
            symbioteHome: tmpHome,
        });

        const scanner = new Scanner(ctx.repo);
        await scanner.scan(FIXTURES_SRC);
    });

    afterEach(async () => {
        await db.close();
        fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it('returns a health report with score', async () => {
        const result = await handleGetHealth(ctx);
        expect(result.data.score).toBeGreaterThanOrEqual(0);
        expect(result.data.score).toBeLessThanOrEqual(100);
    });

    it('returns category breakdowns', async () => {
        const result = await handleGetHealth(ctx);
        expect(result.data.categories.constraints).toBeDefined();
        expect(result.data.categories.circularDeps).toBeDefined();
        expect(result.data.categories.deadCode).toBeDefined();
        expect(result.data.categories.coupling).toBeDefined();
    });

    it('returns constraint violations array', async () => {
        const result = await handleGetHealth(ctx);
        expect(Array.isArray(result.data.constraintViolations)).toBe(true);
    });

    it('returns circular deps array', async () => {
        const result = await handleGetHealth(ctx);
        expect(Array.isArray(result.data.circularDeps)).toBe(true);
    });

    it('returns dead code array', async () => {
        const result = await handleGetHealth(ctx);
        expect(Array.isArray(result.data.deadCode)).toBe(true);
    });

    it('does not save snapshots as a side effect', async () => {
        const before = await ctx.health.getHistory(10);
        const countBefore = before.length;
        await handleGetHealth(ctx);
        await handleGetHealth(ctx);
        const after = await ctx.health.getHistory(10);
        expect(after.length).toBe(countBefore);
    });
});
