import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { createServerContext, type ServerContext } from '#mcp/context.js';
import {
    handleDnaResource,
    handleProjectOverviewResource,
    handleProjectHealthResource,
} from '#mcp/resources.js';

describe('MCP Resources', () => {
    let db: SymbioteDB;
    let ctx: ServerContext;
    let tmpHome: string;
    let tmpBrain: string;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        tmpHome = path.join(os.tmpdir(), `symbiote-mcp-res-home-${Date.now()}`);
        tmpBrain = path.join(os.tmpdir(), `symbiote-mcp-res-brain-${Date.now()}`);

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

    describe('handleDnaResource', () => {
        it('returns a text summary of DNA entries', () => {
            const result = handleDnaResource(ctx);
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('includes entry details when DNA entries exist', () => {
            ctx.dnaEngine.captureInstruction({
                rule: 'Use early returns',
                source: 'correction',
                sessionId: 's1',
            });
            const result = handleDnaResource(ctx);
            expect(result).toContain('early returns');
        });
    });

    describe('handleProjectOverviewResource', () => {
        it('returns a text summary of the project', async () => {
            const result = await handleProjectOverviewResource(ctx);
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result).toContain('Nodes:');
        });
    });

    describe('handleProjectHealthResource', () => {
        it('returns a text summary of project health', async () => {
            const result = await handleProjectHealthResource(ctx);
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result).toContain('Health Score:');
        });
    });
});
