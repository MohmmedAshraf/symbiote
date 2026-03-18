import { describe, it, expect, vi } from 'vitest';
import Graph from 'graphology';
import { PreToolUseHandler } from '#hooks/handlers/pre-tool-use.js';
import { PostToolUseHandler } from '#hooks/handlers/post-tool-use.js';
import type { PreToolUsePayload, PostToolUsePayload } from '#hooks/types.js';
import type { DnaEngine } from '#dna/engine.js';
import type { AttentionSet } from '#hooks/attention.js';
import { EventBus } from '#events/bus.js';

function buildGraph(): Graph {
    const g = new Graph({ type: 'directed', multi: true });

    g.addNode('file:src/service.ts', {
        type: 'file',
        name: 'service.ts',
        filePath: 'src/service.ts',
        lineStart: 1,
        lineEnd: 40,
    });
    g.addNode('fn:src/service.ts:processOrder', {
        type: 'function',
        name: 'processOrder',
        filePath: 'src/service.ts',
        lineStart: 5,
        lineEnd: 25,
    });
    g.addNode('fn:src/service.ts:validateOrder', {
        type: 'function',
        name: 'validateOrder',
        filePath: 'src/service.ts',
        lineStart: 27,
        lineEnd: 40,
    });
    g.addNode('fn:src/api.ts:handleOrder', {
        type: 'function',
        name: 'handleOrder',
        filePath: 'src/api.ts',
        lineStart: 1,
        lineEnd: 15,
    });

    g.addEdge('file:src/service.ts', 'fn:src/service.ts:processOrder', { type: 'contains' });
    g.addEdge('file:src/service.ts', 'fn:src/service.ts:validateOrder', { type: 'contains' });
    g.addEdge('fn:src/service.ts:processOrder', 'fn:src/service.ts:validateOrder', {
        type: 'calls',
    });
    g.addEdge('fn:src/api.ts:handleOrder', 'fn:src/service.ts:processOrder', { type: 'calls' });

    return g;
}

function makeDnaEngine(): DnaEngine {
    return { getActiveEntries: vi.fn().mockReturnValue([]) } as unknown as DnaEngine;
}

function makeAttention(): AttentionSet {
    return { touchFile: vi.fn() } as unknown as AttentionSet;
}

describe('Hook integration', () => {
    it('pre-hook provides context for known file', () => {
        const graph = buildGraph();

        const preHandler = new PreToolUseHandler({
            graph,
            projectRoot: '/project',
            constraints: [
                {
                    scope: 'src/service.ts',
                    content: 'Service layer must not import from API layer',
                },
            ],
            attention: makeAttention(),
            dnaEngine: makeDnaEngine(),
        });

        const readPayload: PreToolUsePayload = {
            type: 'pre_tool_use',
            tool_name: 'Read',
            tool_input: { file_path: '/project/src/service.ts' },
        };

        const readResponse = preHandler.handle(readPayload);
        const ctx = readResponse.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('processOrder');
        expect(ctx).toContain('validateOrder');
    });

    it('pre-hook includes constraint for edit on constrained file', () => {
        const graph = buildGraph();

        const preHandler = new PreToolUseHandler({
            graph,
            projectRoot: '/project',
            constraints: [
                {
                    scope: 'src/service.ts',
                    content: 'Service layer must not import from API layer',
                },
            ],
            attention: makeAttention(),
            dnaEngine: makeDnaEngine(),
        });

        const editPayload: PreToolUsePayload = {
            type: 'pre_tool_use',
            tool_name: 'Edit',
            tool_input: { file_path: '/project/src/service.ts' },
        };

        const editResponse = preHandler.handle(editPayload);
        const ctx = editResponse.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('Service layer must not import from API layer');
    });

    it('post-hook triggers reindex for edited file', async () => {
        const graph = buildGraph();
        const reindexed: string[] = [];

        const postHandler = new PostToolUseHandler({
            graph,
            projectRoot: '/project',
            onReindexFile: async (fp) => {
                reindexed.push(fp);
            },
            onFullRescan: async () => {},
            sessionStore: null as never,
            attention: makeAttention(),
            eventBus: new EventBus(),
            sessionId: 'sess-1',
        });

        const postPayload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Edit',
            tool_input: { file_path: '/project/src/service.ts' },
            tool_output: 'File edited',
        };

        const postResponse = await postHandler.handle(postPayload);
        expect(postResponse).toEqual({});
        expect(reindexed).toEqual(['src/service.ts']);
    });

    it('pre-hook allows unknown tools through cleanly', () => {
        const graph = buildGraph();
        const preHandler = new PreToolUseHandler({
            graph,
            projectRoot: '/project',
            constraints: [],
            attention: makeAttention(),
            dnaEngine: makeDnaEngine(),
        });

        const payload: PreToolUsePayload = {
            type: 'pre_tool_use',
            tool_name: 'WebSearch',
            tool_input: { query: 'typescript generics' },
        };

        const response = preHandler.handle(payload);
        expect(response).toEqual({});
    });

    it('post-hook handles git commit trigger', async () => {
        const graph = buildGraph();
        let rescanTriggered = false;

        const postHandler = new PostToolUseHandler({
            graph,
            projectRoot: '/project',
            onReindexFile: async () => {},
            onFullRescan: async () => {
                rescanTriggered = true;
            },
            sessionStore: null as never,
            attention: makeAttention(),
            eventBus: new EventBus(),
            sessionId: 'sess-1',
        });

        const payload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Bash',
            tool_input: { command: 'git commit -m "feat: add new service"' },
            tool_output: '[main abc1234] feat: add new service',
        };

        await postHandler.handle(payload);
        expect(rescanTriggered).toBe(true);
    });
});
