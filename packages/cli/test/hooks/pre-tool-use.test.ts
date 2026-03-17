import { describe, it, expect, beforeEach } from 'vitest';
import Graph from 'graphology';
import { PreToolUseHandler } from '../../src/hooks/pre-tool-use.js';
import type { PreToolUsePayload } from '../../src/hooks/types.js';

describe('PreToolUseHandler', () => {
    let graph: InstanceType<typeof Graph>;
    let handler: PreToolUseHandler;

    beforeEach(() => {
        graph = new Graph({ multi: true, type: 'directed' });

        graph.addNode('file:src/auth.ts', {
            type: 'file',
            name: 'auth.ts',
            filePath: 'src/auth.ts',
            lineStart: 1,
            lineEnd: 35,
        });

        graph.addNode('fn:src/auth.ts:login', {
            type: 'function',
            name: 'login',
            filePath: 'src/auth.ts',
            lineStart: 5,
            lineEnd: 20,
        });

        graph.addNode('fn:src/auth.ts:logout', {
            type: 'function',
            name: 'logout',
            filePath: 'src/auth.ts',
            lineStart: 22,
            lineEnd: 35,
        });

        graph.addNode('fn:src/db.ts:query', {
            type: 'function',
            name: 'query',
            filePath: 'src/db.ts',
            lineStart: 1,
            lineEnd: 10,
        });

        graph.addEdge('file:src/auth.ts', 'fn:src/auth.ts:login', { type: 'contains' });
        graph.addEdge('file:src/auth.ts', 'fn:src/auth.ts:logout', { type: 'contains' });
        graph.addEdge('fn:src/auth.ts:login', 'fn:src/db.ts:query', { type: 'calls' });

        handler = new PreToolUseHandler({
            graph,
            projectRoot: '/project',
            constraints: [],
        });
    });

    describe('Read tool', () => {
        it('returns allow with context message for known file', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = handler.handle(payload);

            expect(result.decision).toBe('allow');
            expect(result.message).toBeDefined();
            expect(result.message).toContain('auth.ts');
        });

        it('returns allow without message for unknown file', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/unknown.ts' },
            };

            const result = handler.handle(payload);

            expect(result.decision).toBe('allow');
            expect(result.message).toBeUndefined();
        });
    });

    describe('Edit tool', () => {
        it('returns context with dependencies and dependents', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = handler.handle(payload);

            expect(result.decision).toBe('allow');
            expect(result.message).toBeDefined();
            expect(result.message).toContain('login');
            expect(result.message).toContain('Dependencies');
            expect(result.message).toContain('query');
        });

        it('includes constraint content when constraints match', () => {
            const constrainedHandler = new PreToolUseHandler({
                graph,
                projectRoot: '/project',
                constraints: [{ scope: 'src/auth', content: 'Must validate JWT tokens' }],
            });

            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = constrainedHandler.handle(payload);

            expect(result.decision).toBe('allow');
            expect(result.message).toContain('Must validate JWT tokens');
            expect(result.message).toContain('Constraints');
        });
    });

    describe('Write tool', () => {
        it('returns context for known file', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Write',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = handler.handle(payload);

            expect(result.decision).toBe('allow');
            expect(result.message).toBeDefined();
            expect(result.message).toContain('auth.ts');
        });
    });

    describe('non-file tools', () => {
        it('returns allow without context for Grep', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Grep',
                tool_input: { pattern: 'login' },
            };

            const result = handler.handle(payload);

            expect(result.decision).toBe('allow');
            expect(result.message).toBeUndefined();
        });

        it('returns allow without context for Glob', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Glob',
                tool_input: { pattern: '**/*.ts' },
            };

            const result = handler.handle(payload);

            expect(result.decision).toBe('allow');
            expect(result.message).toBeUndefined();
        });

        it('returns allow without context for Bash', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Bash',
                tool_input: { command: 'ls' },
            };

            const result = handler.handle(payload);

            expect(result.decision).toBe('allow');
            expect(result.message).toBeUndefined();
        });
    });
});
