import { describe, it, expect, vi } from 'vitest';
import { UserPromptSubmitHandler } from '#hooks/handlers/user-prompt-submit.js';
import type { UserPromptSubmitPayload } from '#hooks/types.js';
import type { SearchResult } from '#core/search.js';
import type { NodeRecord } from '#storage/repository.js';

function makePayload(prompt: string, sessionId = 'sess-1'): UserPromptSubmitPayload {
    return {
        hook_event_name: 'UserPromptSubmit',
        session_id: sessionId,
        cwd: '/projects/my-app',
        prompt,
    };
}

function makeNode(name: string, filePath: string, lineStart = 1): NodeRecord {
    return {
        id: `${filePath}:${name}`,
        type: 'function',
        name,
        filePath,
        lineStart,
        lineEnd: lineStart + 20,
    };
}

function makeSearchResult(
    name: string,
    filePath: string,
    score: number,
    lineStart = 1,
): SearchResult {
    return {
        node: makeNode(name, filePath, lineStart),
        score,
        source: 'hybrid',
    };
}

describe('UserPromptSubmitHandler', () => {
    function makeHandler(
        overrides: {
            searchResults?: SearchResult[];
            dependents?: NodeRecord[];
        } = {},
    ): UserPromptSubmitHandler {
        const search = {
            search: vi.fn().mockResolvedValue(overrides.searchResults ?? []),
        };
        const graph = {
            getDependents: vi.fn().mockResolvedValue(overrides.dependents ?? []),
        };
        return new UserPromptSubmitHandler({ search, graph });
    }

    it('returns empty for short prompts', async () => {
        const handler = makeHandler();
        const result = await handler.handle(makePayload('ok'));
        expect(result).toEqual({});
    });

    it('returns empty for empty prompt', async () => {
        const handler = makeHandler();
        const result = await handler.handle(makePayload(''));
        expect(result).toEqual({});
    });

    it('injects context when search finds relevant results', async () => {
        const handler = makeHandler({
            searchResults: [makeSearchResult('createMcpServer', 'src/mcp/server.ts', 0.8, 56)],
            dependents: [makeNode('http-api', 'src/mcp/http-api.ts')],
        });

        const result = await handler.handle(makePayload('fix the MCP server creation logic'));

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('createMcpServer');
        expect(ctx).toContain('Relevant code context');
        expect(ctx).toContain('src/mcp/server.ts:56');
    });

    it('includes dependent count when dependents exist', async () => {
        const handler = makeHandler({
            searchResults: [makeSearchResult('createMcpServer', 'src/mcp/server.ts', 0.8)],
            dependents: [
                makeNode('startServer', 'src/mcp/http-api.ts'),
                makeNode('initMcp', 'src/init/mcp.ts'),
            ],
        });

        const result = await handler.handle(makePayload('fix the MCP server creation logic'));

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('2 dependents');
    });

    it('returns nudge only when no results pass threshold', async () => {
        const handler = makeHandler({
            searchResults: [makeSearchResult('unrelated', 'src/utils.ts', 0.1)],
        });

        const result = await handler.handle(makePayload('what is the meaning of life'));

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).not.toContain('Relevant code context');
        expect(ctx).toContain('record_instruction');
    });

    it('limits to top 3 results', async () => {
        const handler = makeHandler({
            searchResults: [
                makeSearchResult('a', 'src/a.ts', 0.9),
                makeSearchResult('b', 'src/b.ts', 0.8),
                makeSearchResult('c', 'src/c.ts', 0.7),
                makeSearchResult('d', 'src/d.ts', 0.6),
            ],
        });

        const result = await handler.handle(makePayload('refactor all the things'));

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('a');
        expect(ctx).toContain('b');
        expect(ctx).toContain('c');
        expect(ctx).not.toContain('src/d.ts');
    });

    it('always includes correction nudge for valid prompts', async () => {
        const handler = makeHandler();
        const result = await handler.handle(makePayload('refactor the auth module'));

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('record_instruction');
        expect(ctx).toContain('propose_decision');
        expect(ctx).toContain('propose_constraint');
    });

    it('includes both code context and nudge when search has results', async () => {
        const handler = makeHandler({
            searchResults: [makeSearchResult('authModule', 'src/auth.ts', 0.8)],
        });

        const result = await handler.handle(makePayload('refactor the auth module'));

        const ctx = result.hookSpecificOutput?.additionalContext ?? '';
        expect(ctx).toContain('Relevant code context');
        expect(ctx).toContain('authModule');
        expect(ctx).toContain('record_instruction');
    });

    it('handles search errors gracefully', async () => {
        const search = {
            search: vi.fn().mockRejectedValue(new Error('search failed')),
        };
        const graph = {
            getDependents: vi.fn().mockResolvedValue([]),
        };
        const handler = new UserPromptSubmitHandler({ search, graph });

        const result = await handler.handle(makePayload('fix something important'));

        expect(result).toEqual({});
    });
});
