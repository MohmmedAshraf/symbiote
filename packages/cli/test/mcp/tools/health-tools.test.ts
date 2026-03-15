import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase, type SynapseDB } from '../../../src/storage/db.js';
import { Scanner } from '../../../src/core/scanner.js';
import {
    createServerContext,
    type ServerContext,
} from '../../../src/mcp/context.js';
import { handleGetHealth } from '../../../src/mcp/tools/health-tools.js';

const FIXTURES_SRC = path.join(
    import.meta.dirname,
    '../../fixtures/brain-project/src'
);
const FIXTURES_BRAIN = path.join(
    import.meta.dirname,
    '../../fixtures/brain-project/.brain'
);

describe('Health Tools', () => {
    let db: SynapseDB;
    let ctx: ServerContext;
    let tmpHome: string;

    beforeEach(async () => {
        db = createDatabase(':memory:');
        tmpHome = path.join(
            os.tmpdir(),
            `synapse-mcp-health-${Date.now()}`
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

        ctx = createServerContext({
            db,
            brainDir: FIXTURES_BRAIN,
            synapseHome: tmpHome,
        });

        const scanner = new Scanner(ctx.repo);
        await scanner.scan(FIXTURES_SRC);
    });

    afterEach(() => {
        db.close();
        fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it('returns a health report with score', () => {
        const result = handleGetHealth(ctx);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('includes orphan files list', () => {
        const result = handleGetHealth(ctx);
        expect(Array.isArray(result.orphanFiles)).toBe(true);
    });

    it('includes circular deps list', () => {
        const result = handleGetHealth(ctx);
        expect(Array.isArray(result.circularDeps)).toBe(true);
    });

    it('includes constraint violations', () => {
        const result = handleGetHealth(ctx);
        expect(Array.isArray(result.constraintViolations)).toBe(
            true
        );
    });

    it('includes dead code list', () => {
        const result = handleGetHealth(ctx);
        expect(Array.isArray(result.deadCode)).toBe(true);
    });
});
