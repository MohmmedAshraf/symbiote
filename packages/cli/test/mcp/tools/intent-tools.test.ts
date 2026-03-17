import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase, type SymbioteDB } from '../../../src/storage/db.js';
import { createServerContext, type ServerContext } from '../../../src/mcp/context.js';
import {
    handleGetConstraints,
    handleGetDecisions,
    handleProposeDecision,
    handleProposeConstraint,
} from '../../../src/mcp/tools/intent-tools.js';

describe('Intent Tools', () => {
    let db: SymbioteDB;
    let ctx: ServerContext;
    let tmpHome: string;
    let tmpBrain: string;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        tmpHome = path.join(os.tmpdir(), `symbiote-mcp-intent-home-${Date.now()}`);
        tmpBrain = path.join(os.tmpdir(), `symbiote-mcp-intent-brain-${Date.now()}`);
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
        fs.mkdirSync(path.join(tmpBrain, 'intent', 'decisions'), {
            recursive: true,
        });
        fs.mkdirSync(path.join(tmpBrain, 'intent', 'constraints'), {
            recursive: true,
        });

        ctx = await createServerContext({
            db,
            brainDir: tmpBrain,
            symbioteHome: tmpHome,
        });
    });

    afterEach(async () => {
        await db.close();
        fs.rmSync(tmpHome, { recursive: true, force: true });
        fs.rmSync(tmpBrain, { recursive: true, force: true });
    });

    describe('handleGetConstraints', () => {
        it('returns empty array when no constraints exist', async () => {
            const result = await handleGetConstraints(ctx, {});
            expect(result.constraints).toEqual([]);
        });

        it('returns constraints after one is proposed', async () => {
            handleProposeConstraint(ctx, {
                id: 'constraint-test',
                content: 'Never use inline styles',
                scope: 'global',
            });

            const result = await handleGetConstraints(ctx, {});
            expect(result.constraints.length).toBe(1);
        });

        it('filters constraints by scope', async () => {
            handleProposeConstraint(ctx, {
                id: 'constraint-global',
                content: 'Global rule',
                scope: 'global',
            });
            handleProposeConstraint(ctx, {
                id: 'constraint-scoped',
                content: 'Scoped rule',
                scope: 'src/api/',
            });

            const global = await handleGetConstraints(ctx, {
                scope: 'global',
            });
            expect(global.constraints.length).toBe(1);
        });
    });

    describe('handleGetDecisions', () => {
        it('returns empty array when no decisions exist', async () => {
            const result = await handleGetDecisions(ctx, {});
            expect(result.decisions).toEqual([]);
        });
    });

    describe('handleProposeDecision', () => {
        it('creates a proposed decision file', async () => {
            const result = handleProposeDecision(ctx, {
                id: 'decision-use-rsc',
                content: 'Use React Server Components for data fetching in Next.js.',
                scope: 'global',
            });

            expect(result.entry.frontmatter.id).toBe('decision-use-rsc');
            expect(result.entry.frontmatter.status).toBe('proposed');
            expect(result.entry.frontmatter.author).toBe('ai');

            const readBack = await ctx.intent.readEntry('decision-use-rsc');
            expect(readBack).toBeDefined();
        });
    });

    describe('handleProposeConstraint', () => {
        it('creates a proposed constraint file', async () => {
            const result = handleProposeConstraint(ctx, {
                id: 'constraint-no-any',
                content: "Never use the 'any' type in TypeScript.",
                scope: 'global',
            });

            expect(result.entry.frontmatter.id).toBe('constraint-no-any');
            expect(result.entry.frontmatter.status).toBe('proposed');
            expect(result.entry.frontmatter.type).toBe('constraint');

            const readBack = await ctx.intent.readEntry('constraint-no-any');
            expect(readBack).toBeDefined();
        });
    });
});
