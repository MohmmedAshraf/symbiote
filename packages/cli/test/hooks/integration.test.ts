import { describe, it, expect } from 'vitest';
import Graph from 'graphology';
import { PreToolUseHandler } from '../../src/hooks/pre-tool-use.js';
import { PostToolUseHandler } from '../../src/hooks/post-tool-use.js';
import type { PreToolUsePayload, PostToolUsePayload } from '../../src/hooks/types.js';

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

describe('Hook integration', () => {
    it('pre-hook provides context, then post-hook would reindex', async () => {
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
        });

        const readPayload: PreToolUsePayload = {
            type: 'pre_tool_use',
            tool_name: 'Read',
            tool_input: { file_path: '/project/src/service.ts' },
        };

        const readResponse = preHandler.handle(readPayload);
        expect(readResponse.decision).toBe('allow');
        expect(readResponse.message).toContain('processOrder');
        expect(readResponse.message).toContain('validateOrder');

        const editPayload: PreToolUsePayload = {
            type: 'pre_tool_use',
            tool_name: 'Edit',
            tool_input: { file_path: '/project/src/service.ts' },
        };

        const editResponse = preHandler.handle(editPayload);
        expect(editResponse.decision).toBe('allow');
        expect(editResponse.message).toContain('Service layer must not import from API layer');

        const reindexed: string[] = [];
        const postHandler = new PostToolUseHandler({
            projectRoot: '/project',
            onReindexFile: async (fp) => {
                reindexed.push(fp);
            },
            onFullRescan: async () => {},
        });

        const postPayload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Edit',
            tool_input: { file_path: '/project/src/service.ts' },
            tool_output: 'File edited',
        };

        const postResponse = await postHandler.handle(postPayload);
        expect(postResponse.decision).toBe('allow');
        expect(reindexed).toEqual(['src/service.ts']);
    });

    it('pre-hook allows unknown tools through cleanly', () => {
        const graph = buildGraph();
        const preHandler = new PreToolUseHandler({
            graph,
            projectRoot: '/project',
            constraints: [],
        });

        const payload: PreToolUsePayload = {
            type: 'pre_tool_use',
            tool_name: 'WebSearch',
            tool_input: { query: 'typescript generics' },
        };

        const response = preHandler.handle(payload);
        expect(response.decision).toBe('allow');
        expect(response.message).toBeUndefined();
    });

    it('post-hook handles git commit trigger', async () => {
        let rescanTriggered = false;
        const postHandler = new PostToolUseHandler({
            projectRoot: '/project',
            onReindexFile: async () => {},
            onFullRescan: async () => {
                rescanTriggered = true;
            },
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
