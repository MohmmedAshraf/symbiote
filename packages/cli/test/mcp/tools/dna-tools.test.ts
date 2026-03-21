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

        fs.mkdirSync(path.join(tmpHome, 'profiles'), { recursive: true });
        const profile = {
            version: 1,
            profile: {
                name: 'Test User',
                handle: 'test',
                bio: '',
                created: '2026-01-01',
                updated: '2026-01-01',
            },
            entries: [],
            stats: {
                total_entries: 0,
                categories: [],
                top_languages: [],
                oldest_entry: null,
                total_sessions: 0,
            },
        };
        fs.writeFileSync(
            path.join(tmpHome, 'profiles', 'personal.json'),
            JSON.stringify(profile, null, 4),
        );
        fs.writeFileSync(
            path.join(tmpHome, 'config.json'),
            JSON.stringify({ active_profile: 'personal' }),
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
            ctx.dnaEngine.captureInstruction({
                rule: 'Use early returns in functions',
                source: 'correction',
                sessionId: 'session-1',
            });
            const result = handleGetDeveloperDna(ctx, {
                category: 'style',
            });
            expect(result.data.entries.length).toBeGreaterThanOrEqual(1);
        });

        it('returns all active entries when no filter', () => {
            ctx.dnaEngine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 'session-1',
            });
            ctx.dnaEngine.captureInstruction({
                rule: 'Prefer Drizzle over Prisma',
                source: 'explicit',
                sessionId: 'session-1',
            });
            const result = handleGetDeveloperDna(ctx, {});
            expect(result.data.entries.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('handleRecordInstruction', () => {
        it('captures an instruction and returns the created entry', () => {
            const result = handleRecordInstruction(ctx, {
                rule: 'Always use server actions for mutations',
                sessionId: 'test-session',
                source: 'correction',
            });

            expect(result.data.entry).toBeDefined();
            expect(result.data.entry.rule).toContain('server actions');
        });

        it('stores explicit instructions with approved status', () => {
            const result = handleRecordInstruction(ctx, {
                rule: 'Never use inline styles',
                sessionId: 'test-session',
                source: 'explicit',
            });

            expect(result.data.entry.status).toBe('approved');
            expect(result.data.entry.confidence).toBe(1.0);
        });
    });
});
