import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase, type SymbioteDB } from '../../src/storage/db.js';
import {
    createServerContext,
    type ServerContext,
} from '../../src/mcp/context.js';
import { createMcpServer } from '../../src/mcp/server.js';

describe('createMcpServer', () => {
    let db: SymbioteDB;
    let ctx: ServerContext;
    let tmpHome: string;
    let tmpBrain: string;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        tmpHome = path.join(
            os.tmpdir(),
            `symbiote-mcp-srv-home-${Date.now()}`
        );
        tmpBrain = path.join(
            os.tmpdir(),
            `symbiote-mcp-srv-brain-${Date.now()}`
        );
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
            JSON.stringify({ version: 1, entries: [] })
        );
        fs.mkdirSync(path.join(tmpBrain, 'intent', 'decisions'), {
            recursive: true,
        });
        fs.mkdirSync(path.join(tmpBrain, 'intent', 'constraints'), {
            recursive: true,
        });

        ctx = createServerContext({
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

    it('creates an MCP server without throwing', () => {
        expect(() => createMcpServer(ctx)).not.toThrow();
    });

    it('returns an object with the server instance', () => {
        const { server } = createMcpServer(ctx);
        expect(server).toBeDefined();
    });
});
