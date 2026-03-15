import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase, type SynapseDB } from '../../src/storage/db.js';
import {
    createServerContext,
    type ServerContext,
} from '../../src/mcp/context.js';
import {
    handleDnaResource,
    handleProjectOverviewResource,
    handleProjectHealthResource,
} from '../../src/mcp/resources.js';

describe('MCP Resources', () => {
    let db: SynapseDB;
    let ctx: ServerContext;
    let tmpHome: string;
    let tmpBrain: string;

    beforeEach(() => {
        db = createDatabase(':memory:');
        tmpHome = path.join(
            os.tmpdir(),
            `synapse-mcp-res-home-${Date.now()}`
        );
        tmpBrain = path.join(
            os.tmpdir(),
            `synapse-mcp-res-brain-${Date.now()}`
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
            synapseHome: tmpHome,
        });
    });

    afterEach(() => {
        db.close();
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
            ctx.dnaEngine.captureInstruction(
                'Use early returns',
                's1',
                'correction'
            );
            const result = handleDnaResource(ctx);
            expect(result).toContain('early returns');
        });
    });

    describe('handleProjectOverviewResource', () => {
        it('returns a text summary of the project', () => {
            const result = handleProjectOverviewResource(ctx);
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result).toContain('Nodes:');
        });
    });

    describe('handleProjectHealthResource', () => {
        it('returns a text summary of project health', () => {
            const result = handleProjectHealthResource(ctx);
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result).toContain('Health Score:');
        });
    });
});
