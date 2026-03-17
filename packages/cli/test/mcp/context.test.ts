import { describe, it, expect, afterEach } from 'vitest';
import { createServerContext, type ServerContext } from '../../src/mcp/context.js';
import { createDatabase } from '../../src/storage/db.js';

describe('createServerContext', () => {
    let ctx: ServerContext;

    afterEach(async () => {
        await ctx?.db.close();
    });

    it('creates a context with all required services', async () => {
        const db = await createDatabase(':memory:');
        ctx = await createServerContext({
            db,
            rootDir: process.cwd(),
            brainDir: '/tmp/test-brain',
            symbioteHome: '/tmp/test-symbiote',
        });

        expect(ctx.db).toBe(db);
        expect(ctx.repo).toBeDefined();
        expect(ctx.graph).toBeDefined();
        expect(ctx.intent).toBeDefined();
        expect(ctx.health).toBeDefined();
    });

    it('exposes dna engine when symbioteHome is provided', async () => {
        const db = await createDatabase(':memory:');
        ctx = await createServerContext({
            db,
            rootDir: process.cwd(),
            brainDir: '/tmp/test-brain',
            symbioteHome: '/tmp/test-symbiote',
        });

        expect(ctx.dnaStorage).toBeDefined();
        expect(ctx.dnaEngine).toBeDefined();
    });
});
