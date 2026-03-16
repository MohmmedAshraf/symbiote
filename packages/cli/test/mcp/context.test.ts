import { describe, it, expect, afterEach } from 'vitest';
import {
    createServerContext,
    type ServerContext,
} from '../../src/mcp/context.js';
import { createDatabase } from '../../src/storage/db.js';

describe('createServerContext', () => {
    let ctx: ServerContext;

    afterEach(() => {
        ctx?.db.close();
    });

    it('creates a context with all required services', () => {
        const db = createDatabase(':memory:');
        ctx = createServerContext({
            db,
            brainDir: '/tmp/test-brain',
            symbioteHome: '/tmp/test-symbiote',
        });

        expect(ctx.db).toBe(db);
        expect(ctx.repo).toBeDefined();
        expect(ctx.graph).toBeDefined();
        expect(ctx.intent).toBeDefined();
        expect(ctx.health).toBeDefined();
    });

    it('exposes dna engine when symbioteHome is provided', () => {
        const db = createDatabase(':memory:');
        ctx = createServerContext({
            db,
            brainDir: '/tmp/test-brain',
            symbioteHome: '/tmp/test-symbiote',
        });

        expect(ctx.dnaStorage).toBeDefined();
        expect(ctx.dnaEngine).toBeDefined();
    });
});
