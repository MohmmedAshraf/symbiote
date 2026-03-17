import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { createServerContext, type ServerContext } from '#mcp/context.js';
import { handleGetDeveloperDna, handleRecordInstruction } from '#mcp/tools/dna-tools.js';

describe('DNA Tools', () => {
    let db: SymbioteDB;
    let ctx: ServerContext;
    let tmpHome: string;
    let tmpBrain: string;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        tmpHome = path.join(os.tmpdir(), `symbiote-mcp-dna-${Date.now()}`);
        tmpBrain = path.join(os.tmpdir(), `symbiote-mcp-brain-${Date.now()}`);
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
            rootDir: process.cwd(),
            brainDir: tmpBrain,
            symbioteHome: tmpHome,
        });
    });

    afterEach(async () => {
        await db.close();
        fs.rmSync(tmpHome, { recursive: true, force: true });
        fs.rmSync(tmpBrain, { recursive: true, force: true });
    });

    describe('handleGetDeveloperDna', () => {
        it('returns empty array when no DNA entries exist', () => {
            const result = handleGetDeveloperDna(ctx, {});
            expect(result.data.entries).toEqual([]);
        });

        it('returns DNA entries filtered by category', () => {
            ctx.dnaEngine.captureInstruction(
                'Use early returns in functions',
                'session-1',
                'correction',
            );
            const result = handleGetDeveloperDna(ctx, {
                category: 'style',
            });
            expect(result.data.entries.length).toBeGreaterThanOrEqual(1);
        });

        it('returns all active entries when no filter', () => {
            ctx.dnaEngine.captureInstruction('Use early returns', 'session-1', 'correction');
            ctx.dnaEngine.captureInstruction('Prefer Drizzle over Prisma', 'session-1', 'explicit');
            const result = handleGetDeveloperDna(ctx, {});
            expect(result.data.entries.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('handleRecordInstruction', () => {
        it('captures an instruction and returns the created entry', () => {
            const result = handleRecordInstruction(ctx, {
                instruction: 'Always use server actions for mutations',
                sessionId: 'test-session',
                isExplicit: false,
            });

            expect(result.data.entry).toBeDefined();
            expect(result.data.entry.content).toContain('server actions');
        });

        it('stores explicit instructions with approved status', () => {
            const result = handleRecordInstruction(ctx, {
                instruction: 'Never use inline styles',
                sessionId: 'test-session',
                isExplicit: true,
            });

            expect(result.data.entry.frontmatter.status).toBe('approved');
            expect(result.data.entry.frontmatter.confidence).toBe(1.0);
        });
    });
});
