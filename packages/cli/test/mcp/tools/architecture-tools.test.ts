import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { createDatabase, SymbioteDB } from '../../../src/storage/db.js';
import { createCortexSchema } from '../../../src/cortex/schema.js';
import { CortexRepository } from '../../../src/cortex/repository.js';
import { CortexEngine } from '../../../src/cortex/engine.js';
import {
    handleFindPatterns,
    handleGetArchitecture,
} from '../../../src/mcp/tools/architecture-tools.js';

const TOPOLOGY = resolve(__dirname, '../../fixtures/cortex/topology');

describe('Architecture Tools', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);
        const engine = new CortexEngine(repo);
        await engine.run({ rootDir: TOPOLOGY });
    });

    afterEach(async () => {
        await db.close();
    });

    describe('handleFindPatterns', () => {
        it('returns findings for a file scope', async () => {
            const result = await handleFindPatterns(repo, {
                scope: 'controller.ts',
            });
            expect(result.data).toBeDefined();
            expect(Array.isArray(result.data.findings)).toBe(true);
            expect(result.depth).toBe(7);
        });

        it('returns findings for a directory scope', async () => {
            const result = await handleFindPatterns(repo, {
                scope: 'src/',
            });
            expect(Array.isArray(result.data.findings)).toBe(true);
        });

        it('filters by finding kind', async () => {
            const result = await handleFindPatterns(repo, {
                scope: 'all',
                kinds: ['god_class', 'circular_dependency'],
            });
            for (const f of result.data.findings) {
                expect(['god_class', 'circular_dependency']).toContain(f.kind);
            }
        });

        it('filters by severity', async () => {
            const result = await handleFindPatterns(repo, {
                scope: 'all',
                severity: 'warning',
            });
            for (const f of result.data.findings) {
                expect(['warning', 'error']).toContain(f.severity);
            }
        });

        it('includes depth and deepening in response', async () => {
            const result = await handleFindPatterns(repo, {
                scope: 'all',
            });
            expect(typeof result.depth).toBe('number');
            expect(typeof result.deepening).toBe('boolean');
        });
    });

    describe('handleGetArchitecture', () => {
        it('returns detected layers', async () => {
            const result = await handleGetArchitecture(repo);
            expect(result.data).toBeDefined();
            expect(Array.isArray(result.data.layers)).toBe(true);
        });

        it('returns layer boundaries with edge counts', async () => {
            const result = await handleGetArchitecture(repo);
            expect(Array.isArray(result.data.boundaries)).toBe(true);
        });

        it('returns violations', async () => {
            const result = await handleGetArchitecture(repo);
            expect(Array.isArray(result.data.violations)).toBe(true);
        });

        it('returns community count', async () => {
            const result = await handleGetArchitecture(repo);
            expect(typeof result.data.communityCount).toBe('number');
            expect(result.data.communityCount).toBeGreaterThan(0);
        });

        it('returns top hubs by PageRank', async () => {
            const result = await handleGetArchitecture(repo);
            expect(Array.isArray(result.data.topHubs)).toBe(true);
            if (result.data.topHubs.length > 1) {
                expect(result.data.topHubs[0].pageRank).toBeGreaterThanOrEqual(
                    result.data.topHubs[1].pageRank,
                );
            }
        });

        it('includes depth in response', async () => {
            const result = await handleGetArchitecture(repo);
            expect(result.depth).toBe(7);
        });
    });
});
