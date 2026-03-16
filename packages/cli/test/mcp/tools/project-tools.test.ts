import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDatabase, type SymbioteDB } from '../../../src/storage/db.js';
import { Scanner } from '../../../src/core/scanner.js';
import {
    createServerContext,
    type ServerContext,
} from '../../../src/mcp/context.js';
import {
    handleGetProjectOverview,
    handleGetContextForFile,
    handleQueryGraph,
    handleSemanticSearch,
} from '../../../src/mcp/tools/project-tools.js';

const FIXTURES_SRC = path.join(
    import.meta.dirname,
    '../../fixtures/brain-project/src'
);
const FIXTURES_BRAIN = path.join(
    import.meta.dirname,
    '../../fixtures/brain-project/.brain'
);

describe('Project Tools', () => {
    let db: SymbioteDB;
    let ctx: ServerContext;
    let tmpHome: string;

    beforeEach(async () => {
        db = createDatabase(':memory:');
        tmpHome = path.join(
            os.tmpdir(),
            `symbiote-mcp-proj-${Date.now()}`
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
            symbioteHome: tmpHome,
        });

        const scanner = new Scanner(ctx.repo);
        await scanner.scan(FIXTURES_SRC);
    });

    afterEach(() => {
        db.close();
        fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    describe('handleGetProjectOverview', () => {
        it('returns project stats', () => {
            const result = handleGetProjectOverview(ctx);
            expect(result.totalNodes).toBeGreaterThan(0);
            expect(result.totalEdges).toBeGreaterThanOrEqual(0);
            expect(result.nodesByType).toBeDefined();
        });

        it('includes active constraints in overview', () => {
            const result = handleGetProjectOverview(ctx);
            expect(result.constraints).toBeDefined();
            expect(Array.isArray(result.constraints)).toBe(true);
        });
    });

    describe('handleGetContextForFile', () => {
        it('returns file context with nodes and edges', () => {
            const files = ctx.repo
                .getAllNodes()
                .map((n) => n.filePath);
            const testFile = files[0];

            const result = handleGetContextForFile(ctx, {
                filePath: testFile,
            });
            expect(result.filePath).toBe(testFile);
            expect(result.nodes).toBeDefined();
        });

        it('includes related constraints and decisions', () => {
            const files = ctx.repo
                .getAllNodes()
                .map((n) => n.filePath);
            const testFile = files[0];

            const result = handleGetContextForFile(ctx, {
                filePath: testFile,
            });
            expect(result.constraints).toBeDefined();
            expect(result.decisions).toBeDefined();
        });
    });

    describe('handleQueryGraph', () => {
        it('searches nodes by name', () => {
            const result = handleQueryGraph(ctx, {
                query: 'format',
                type: 'search',
            });
            expect(result.results.length).toBeGreaterThanOrEqual(1);
        });

        it('finds dependencies for a node', () => {
            const allNodes = ctx.repo.getAllNodes();
            const nodeWithDeps = allNodes[0];

            const result = handleQueryGraph(ctx, {
                query: nodeWithDeps.id,
                type: 'dependencies',
            });
            expect(result.results).toBeDefined();
        });

        it('finds dependents for a node', () => {
            const allNodes = ctx.repo.getAllNodes();
            const node = allNodes[0];

            const result = handleQueryGraph(ctx, {
                query: node.id,
                type: 'dependents',
            });
            expect(result.results).toBeDefined();
        });
    });

    describe('handleSemanticSearch', () => {
        it('returns empty results when no embeddings exist', () => {
            const result = handleSemanticSearch(ctx, {
                query: 'authentication',
                limit: 5,
            });
            expect(result.results).toEqual([]);
        });
    });
});
