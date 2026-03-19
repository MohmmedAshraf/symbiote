import { describe, it, expect, beforeEach } from 'vitest';
import Graph from 'graphology';
import { PreToolUseHandler } from '#hooks/handlers/pre-tool-use.js';
import { AttentionSet } from '#hooks/attention.js';
import type { PreToolUsePayload } from '#hooks/types.js';
import type { DnaEngine } from '#dna/engine.js';

function makeDnaEngine(
    entries: Array<{ category: string; content: string; status?: string }>,
): DnaEngine {
    return {
        getActiveEntries: () =>
            entries
                .filter((e) => (e.status ?? 'approved') !== 'rejected')
                .map((e) => ({
                    frontmatter: {
                        id: e.content,
                        category: e.category as never,
                        confidence: 1,
                        source: 'explicit' as const,
                        status: (e.status ?? 'approved') as never,
                        firstSeen: '2024-01-01',
                        lastSeen: '2024-01-01',
                        occurrences: 1,
                        sessionIds: [],
                    },
                    content: e.content,
                })),
    } as unknown as DnaEngine;
}

function buildGraph(): InstanceType<typeof Graph> {
    const graph = new Graph({ multi: true, type: 'directed' });

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

    return graph;
}

describe('PreToolUseHandler (handlers/)', () => {
    let graph: InstanceType<typeof Graph>;
    let attention: AttentionSet;
    let dnaEngine: DnaEngine;
    let handler: PreToolUseHandler;

    beforeEach(() => {
        graph = buildGraph();
        attention = new AttentionSet();
        dnaEngine = makeDnaEngine([]);
        handler = new PreToolUseHandler({
            graph,
            projectRoot: '/project',
            constraints: [],
            attention,
            dnaEngine,
        });
    });

    describe('Read tool', () => {
        it('returns file context for known file', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = handler.handle(payload);

            expect(result.hookSpecificOutput).toBeDefined();
            expect(result.hookSpecificOutput!.hookEventName).toBe('PreToolUse');
            expect(result.hookSpecificOutput!.additionalContext).toContain('auth.ts');
            expect(result.hookSpecificOutput!.additionalContext).toContain('login');
        });

        it('returns empty response for unknown file', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/unknown.ts' },
            };

            const result = handler.handle(payload);

            expect(result.hookSpecificOutput).toBeUndefined();
        });

        it('updates attention set for known file', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            handler.handle(payload);

            expect(attention.getFile('src/auth.ts')).toBeDefined();
            expect(attention.getFile('src/auth.ts')!.accessCount).toBe(1);
        });

        it('updates attention even when file not in graph', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/new-file.ts' },
            };

            handler.handle(payload);

            expect(attention.getFile('src/new-file.ts')).toBeDefined();
        });
    });

    describe('Edit tool', () => {
        it('returns context with dependencies', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = handler.handle(payload);

            expect(result.hookSpecificOutput).toBeDefined();
            expect(result.hookSpecificOutput!.additionalContext).toContain('Dependencies');
            expect(result.hookSpecificOutput!.additionalContext).toContain('query');
        });

        it('includes impact warning when dependents exceed threshold', () => {
            for (let i = 0; i < 6; i++) {
                const callerId = `fn:src/caller${i}.ts:fn${i}`;
                graph.addNode(callerId, {
                    type: 'function',
                    name: `fn${i}`,
                    filePath: `src/caller${i}.ts`,
                    lineStart: 1,
                    lineEnd: 5,
                });
                graph.addEdge(callerId, 'fn:src/auth.ts:login', { type: 'calls' });
            }

            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = handler.handle(payload);

            expect(result.hookSpecificOutput!.additionalContext).toContain('Impact warning');
            expect(result.hookSpecificOutput!.additionalContext).toContain('dependents');
        });

        it('does not include impact warning when dependents are 5 or fewer', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = handler.handle(payload);

            expect(result.hookSpecificOutput!.additionalContext).not.toContain('Impact warning');
        });

        it('includes matching constraints', () => {
            const handlerWithConstraints = new PreToolUseHandler({
                graph,
                projectRoot: '/project',
                constraints: [{ scope: 'src/auth', content: 'Must validate JWT tokens' }],
                attention,
                dnaEngine,
            });

            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = handlerWithConstraints.handle(payload);

            expect(result.hookSpecificOutput!.additionalContext).toContain(
                'Must validate JWT tokens',
            );
            expect(result.hookSpecificOutput!.additionalContext).toContain('Constraints');
        });
    });

    describe('Write tool', () => {
        it('includes impact warning when dependents exceed threshold', () => {
            for (let i = 0; i < 6; i++) {
                const callerId = `fn:src/caller${i}.ts:fn${i}`;
                graph.addNode(callerId, {
                    type: 'function',
                    name: `fn${i}`,
                    filePath: `src/caller${i}.ts`,
                    lineStart: 1,
                    lineEnd: 5,
                });
                graph.addEdge(callerId, 'fn:src/auth.ts:login', { type: 'calls' });
            }

            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Write',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            const result = handler.handle(payload);

            expect(result.hookSpecificOutput!.additionalContext).toContain('Impact warning');
        });
    });

    describe('Agent tool', () => {
        it('returns DNA summary and global constraints', () => {
            const handlerWithDna = new PreToolUseHandler({
                graph,
                projectRoot: '/project',
                constraints: [
                    { scope: '*', content: 'Use TypeScript strict mode' },
                    { scope: 'src/', content: 'Scoped constraint' },
                ],
                attention,
                dnaEngine: makeDnaEngine([
                    { category: 'style', content: '4-space indentation' },
                    { category: 'anti-patterns', content: 'Never use any' },
                ]),
            });

            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Agent',
                tool_input: {},
            };

            const result = handlerWithDna.handle(payload);

            expect(result.hookSpecificOutput).toBeDefined();
            const ctx = result.hookSpecificOutput!.additionalContext!;
            expect(ctx).toContain('Developer DNA');
            expect(ctx).toContain('4-space indentation');
            expect(ctx).toContain('Never use any');
            expect(ctx).toContain('Active constraints');
            expect(ctx).toContain('Use TypeScript strict mode');
            expect(ctx).not.toContain('Scoped constraint');
        });

        it('returns empty response when no DNA or global constraints', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Agent',
                tool_input: {},
            };

            const result = handler.handle(payload);

            expect(result.hookSpecificOutput).toBeUndefined();
        });
    });

    describe('Grep tool', () => {
        it('returns empty response', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Grep',
                tool_input: { pattern: 'login' },
            };

            const result = handler.handle(payload);

            expect(result).toEqual({});
        });
    });

    describe('Glob tool', () => {
        it('returns empty response', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Glob',
                tool_input: { pattern: '**/*.ts' },
            };

            const result = handler.handle(payload);

            expect(result).toEqual({});
        });
    });

    describe('WebFetch tool', () => {
        it('returns empty response', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'WebFetch',
                tool_input: { url: 'https://example.com' },
            };

            expect(handler.handle(payload)).toEqual({});
        });
    });

    describe('WebSearch tool', () => {
        it('returns empty response', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'WebSearch',
                tool_input: { query: 'graphology' },
            };

            expect(handler.handle(payload)).toEqual({});
        });
    });

    describe('Bash tool', () => {
        it('returns empty response for commands without file paths', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Bash',
                tool_input: { command: 'ls -la' },
            };

            expect(handler.handle(payload)).toEqual({});
        });

        it('returns file context when command references a known file', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Bash',
                tool_input: { command: 'npx tsc src/auth.ts' },
            };

            const result = handler.handle(payload);

            expect(result.hookSpecificOutput).toBeDefined();
            expect(result.hookSpecificOutput!.additionalContext).toContain('auth.ts');
        });

        it('updates attention when command references a known file', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Bash',
                tool_input: { command: 'npx tsc src/auth.ts' },
            };

            handler.handle(payload);

            expect(attention.getFile('src/auth.ts')).toBeDefined();
        });
    });

    describe('blind spot detection', () => {
        it('shows blind spots for unread dependents', () => {
            const g = buildGraph();
            g.addNode('fn:src/api.ts:handleLogin', {
                type: 'function',
                name: 'handleLogin',
                filePath: 'src/api.ts',
                lineStart: 1,
                lineEnd: 10,
            });
            g.addEdge('fn:src/api.ts:handleLogin', 'fn:src/auth.ts:login', { type: 'calls' });

            const att = new AttentionSet();
            const h = new PreToolUseHandler({
                graph: g,
                projectRoot: '/project',
                constraints: [],
                attention: att,
                dnaEngine,
            });

            const result = h.handle({
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/auth.ts' },
            });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).toContain('Blind spot');
            expect(ctx).toContain('handleLogin');
        });

        it('skips blind spots when dependents already read', () => {
            const g = buildGraph();
            g.addNode('fn:src/api.ts:handleLogin', {
                type: 'function',
                name: 'handleLogin',
                filePath: 'src/api.ts',
                lineStart: 1,
                lineEnd: 10,
            });
            g.addEdge('fn:src/api.ts:handleLogin', 'fn:src/auth.ts:login', { type: 'calls' });

            const att = new AttentionSet();
            att.touchFile('src/api.ts');

            const h = new PreToolUseHandler({
                graph: g,
                projectRoot: '/project',
                constraints: [],
                attention: att,
                dnaEngine,
            });

            const result = h.handle({
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/auth.ts' },
            });

            const ctx = result.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toContain('Blind spot');
        });

        it('only shows blind spot once per file (deliveredContext)', () => {
            const g = buildGraph();
            g.addNode('fn:src/api.ts:handleLogin', {
                type: 'function',
                name: 'handleLogin',
                filePath: 'src/api.ts',
                lineStart: 1,
                lineEnd: 10,
            });
            g.addEdge('fn:src/api.ts:handleLogin', 'fn:src/auth.ts:login', { type: 'calls' });

            const att = new AttentionSet();
            const h = new PreToolUseHandler({
                graph: g,
                projectRoot: '/project',
                constraints: [],
                attention: att,
                dnaEngine,
            });

            h.handle({
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/auth.ts' },
            });

            const result2 = h.handle({
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/auth.ts' },
            });

            const ctx = result2.hookSpecificOutput?.additionalContext ?? '';
            expect(ctx).not.toContain('Blind spot');
        });
    });

    describe('attention tracking', () => {
        it('increments access count on repeated file reads', () => {
            const payload: PreToolUsePayload = {
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/auth.ts' },
            };

            handler.handle(payload);
            handler.handle(payload);

            expect(attention.getFile('src/auth.ts')!.accessCount).toBe(2);
        });

        it('tracks multiple different files', () => {
            handler.handle({
                type: 'pre_tool_use',
                tool_name: 'Read',
                tool_input: { file_path: '/project/src/auth.ts' },
            });
            handler.handle({
                type: 'pre_tool_use',
                tool_name: 'Edit',
                tool_input: { file_path: '/project/src/new.ts' },
            });

            expect(attention.getFile('src/auth.ts')).toBeDefined();
            expect(attention.getFile('src/new.ts')).toBeDefined();
        });
    });
});
