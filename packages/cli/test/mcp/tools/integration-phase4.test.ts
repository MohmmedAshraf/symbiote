import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { createDatabase, SymbioteDB } from '../../../src/storage/db.js';
import { createCortexSchema, refreshSymbolsTable } from '../../../src/cortex/schema.js';
import { CortexRepository } from '../../../src/cortex/repository.js';
import { installPgq, createPropertyGraph, isPgqAvailable } from '../../../src/cortex/pgq.js';
import {
    handleQueryGraphV2,
    handleGetContextForSymbol,
} from '../../../src/mcp/tools/graph-tools.js';
import { handleRenameSymbol } from '../../../src/mcp/tools/rename-tool.js';
import type { RenameChange } from '../../../src/mcp/tools/rename-tool.js';
import type { SymbolContext } from '../../../src/mcp/tools/graph-tools.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const FIXTURES = resolve(__dirname, '../../fixtures/cortex/simple');

describe('Phase 4 Integration', () => {
    let db: SymbioteDB;
    let repo: CortexRepository;
    let pgqAvailable: boolean;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        await createCortexSchema(db);
        repo = new CortexRepository(db);

        await repo.upsertFileNode({
            id: 'file:utils.ts',
            path: 'utils.ts',
            hash: 'abc',
            language: 'typescript',
            depthLevel: 3,
            lastIndexed: null,
        });
        await repo.upsertFileNode({
            id: 'file:service.ts',
            path: 'service.ts',
            hash: 'def',
            language: 'typescript',
            depthLevel: 3,
            lastIndexed: null,
        });

        await repo.insertFunctionNodes([
            {
                id: 'fn:utils.ts:validateEmail',
                name: 'validateEmail',
                qualifiedName: 'validateEmail',
                filePath: 'utils.ts',
                lineStart: 1,
                lineEnd: 3,
                isAsync: false,
                isExported: true,
                isEntryPoint: false,
                entryPointScore: 0,
                signature: '(email: string): boolean',
                community: null,
                pageRank: null,
                betweenness: null,
            },
        ]);
        await repo.insertClassNodes([
            {
                id: 'class:service.ts:UserService',
                name: 'UserService',
                filePath: 'service.ts',
                lineStart: 4,
                lineEnd: 15,
                isAbstract: false,
                isExported: true,
                community: null,
                pageRank: null,
                betweenness: null,
            },
        ]);
        await repo.insertMethodNodes([
            {
                id: 'method:service.ts:UserService.create',
                name: 'create',
                className: 'UserService',
                qualifiedName: 'UserService.create',
                filePath: 'service.ts',
                lineStart: 5,
                lineEnd: 10,
                visibility: 'public',
                isStatic: false,
                isAsync: true,
                community: null,
                pageRank: null,
                betweenness: null,
            },
        ]);
        await repo.insertCallsEdges([
            {
                sourceId: 'method:service.ts:UserService.create',
                targetId: 'fn:utils.ts:validateEmail',
                line: 6,
                confidence: 0.95,
                isDynamic: false,
                isAsync: false,
                isIndirect: false,
                stage: 3,
                reason: 'direct call',
            },
        ]);
        await repo.insertImportsEdges([
            {
                sourceId: 'file:service.ts',
                targetId: 'file:utils.ts',
                line: 1,
                kind: 'named',
                originalName: 'validateEmail',
                alias: null,
                confidence: 1.0,
                stage: 2,
                reason: 'import statement',
            },
        ]);

        await refreshSymbolsTable(db);

        try {
            await installPgq(db);
            await createPropertyGraph(db);
            pgqAvailable = true;
        } catch {
            pgqAvailable = false;
        }
    });

    afterEach(async () => {
        await db.close();
    });

    it('query_graph returns symbols via plain SQL', async () => {
        const result = await handleQueryGraphV2(
            { db, cortexRepo: repo },
            { query: 'SELECT name, kind FROM symbols ORDER BY name' },
        );
        expect(result.data).toHaveLength(3);
        expect(result.depth).toBe(3);
        expect(result.deepening).toBe(false);
    });

    it('get_context_for_symbol returns callers for validateEmail', async () => {
        const result = await handleGetContextForSymbol(
            { db, cortexRepo: repo },
            { symbol: 'validateEmail' },
        );
        const data = result.data as SymbolContext;
        expect(data.symbol.name).toBe('validateEmail');
        expect(data.callers).toHaveLength(1);
        expect(data.callers[0].sourceId).toBe('method:service.ts:UserService.create');
    });

    it('rename_symbol produces correct diff for validateEmail', async () => {
        const result = await handleRenameSymbol(
            { cortexRepo: repo, rootDir: FIXTURES },
            { symbol: 'validateEmail', newName: 'isValidEmail' },
        );
        const data = result.data as { changes: RenameChange[] };
        expect(data.changes.length).toBeGreaterThan(0);

        for (const change of data.changes) {
            expect(change.oldText).toContain('validateEmail');
            expect(change.newText).toContain('isValidEmail');
        }
    });

    it('all responses include ToolResponse fields', async () => {
        const queryResult = await handleQueryGraphV2(
            { db, cortexRepo: repo },
            { query: 'SELECT name FROM symbols LIMIT 1' },
        );
        expect(queryResult).toHaveProperty('data');
        expect(queryResult).toHaveProperty('depth');
        expect(queryResult).toHaveProperty('deepening');

        const symbolResult = await handleGetContextForSymbol(
            { db, cortexRepo: repo },
            { symbol: 'validateEmail' },
        );
        expect(symbolResult).toHaveProperty('data');
        expect(symbolResult).toHaveProperty('depth');
        expect(symbolResult).toHaveProperty('deepening');

        const renameResult = await handleRenameSymbol(
            { cortexRepo: repo, rootDir: FIXTURES },
            { symbol: 'validateEmail', newName: 'isValidEmail' },
        );
        expect(renameResult).toHaveProperty('data');
        expect(renameResult).toHaveProperty('depth');
        expect(renameResult).toHaveProperty('deepening');
    });

    it.skipIf(!pgqAvailable)('PGQ graph query works end-to-end', async () => {
        const result = await handleQueryGraphV2(
            { db, cortexRepo: repo },
            {
                query: `SELECT callee, file FROM GRAPH_TABLE (code_graph
                    MATCH (a:symbols)-[e:edges_calls]->(b:symbols)
                    WHERE a.name = 'create'
                    COLUMNS (b.name AS callee, b.file_path AS file)
                )`,
            },
        );
        expect(result.data).toHaveLength(1);
        expect((result.data as Record<string, unknown>[])[0].callee).toBe('validateEmail');
    });
});
