import { describe, it, expect, beforeEach } from 'vitest';
import { PostToolUseHandler } from '../../src/hooks/post-tool-use.js';
import { PostToolUsePayload } from '../../src/hooks/types.js';

describe('PostToolUseHandler', () => {
    let handler: PostToolUseHandler;
    let reindexCalled: string[];
    let fullRescanCalled: boolean;

    beforeEach(() => {
        reindexCalled = [];
        fullRescanCalled = false;
        handler = new PostToolUseHandler({
            projectRoot: '/projects/my-app',
            onReindexFile: async (relativePath: string) => {
                reindexCalled.push(relativePath);
            },
            onFullRescan: async () => {
                fullRescanCalled = true;
            },
        });
    });

    it('triggers reindex for Edit tool', async () => {
        const payload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Edit',
            tool_input: { file_path: '/projects/my-app/src/auth.ts' },
            tool_output: 'ok',
        };

        const result = await handler.handle(payload);

        expect(result).toEqual({ decision: 'allow' });
        expect(reindexCalled).toEqual(['src/auth.ts']);
        expect(fullRescanCalled).toBe(false);
    });

    it('triggers reindex for Write tool', async () => {
        const payload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Write',
            tool_input: { file_path: '/projects/my-app/src/utils/hash.ts' },
            tool_output: 'ok',
        };

        const result = await handler.handle(payload);

        expect(result).toEqual({ decision: 'allow' });
        expect(reindexCalled).toEqual(['src/utils/hash.ts']);
        expect(fullRescanCalled).toBe(false);
    });

    it('triggers full rescan for git commit', async () => {
        const payload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Bash',
            tool_input: { command: 'git commit -m "feat: add login"' },
            tool_output: 'ok',
        };

        const result = await handler.handle(payload);

        expect(result).toEqual({ decision: 'allow' });
        expect(fullRescanCalled).toBe(true);
        expect(reindexCalled).toEqual([]);
    });

    it('does not trigger rescan for git status', async () => {
        const payload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Bash',
            tool_input: { command: 'git status' },
            tool_output: 'ok',
        };

        const result = await handler.handle(payload);

        expect(result).toEqual({ decision: 'allow' });
        expect(fullRescanCalled).toBe(false);
        expect(reindexCalled).toEqual([]);
    });

    it('returns allow for unrelated tools without side effects', async () => {
        const payload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Read',
            tool_input: { file_path: '/projects/my-app/src/auth.ts' },
            tool_output: 'file contents',
        };

        const result = await handler.handle(payload);

        expect(result).toEqual({ decision: 'allow' });
        expect(reindexCalled).toEqual([]);
        expect(fullRescanCalled).toBe(false);
    });

    it('returns allow even when onReindexFile throws', async () => {
        handler = new PostToolUseHandler({
            projectRoot: '/projects/my-app',
            onReindexFile: async () => {
                throw new Error('reindex failed');
            },
            onFullRescan: async () => {
                fullRescanCalled = true;
            },
        });

        const payload: PostToolUsePayload = {
            type: 'post_tool_use',
            tool_name: 'Edit',
            tool_input: { file_path: '/projects/my-app/src/auth.ts' },
            tool_output: 'ok',
        };

        const result = await handler.handle(payload);

        expect(result).toEqual({ decision: 'allow' });
    });
});
