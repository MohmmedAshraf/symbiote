import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserPromptSubmitHandler } from '#hooks/handlers/user-prompt-submit.js';
import type { DnaEngine } from '#dna/engine.js';
import type { UserPromptSubmitPayload } from '#hooks/types.js';

function makeDnaEngine(): DnaEngine {
    return {
        captureInstructionWithPatternMatch: vi.fn().mockResolvedValue({}),
    } as unknown as DnaEngine;
}

function makePayload(prompt: string, sessionId = 'sess-1'): UserPromptSubmitPayload {
    return {
        hook_event_name: 'UserPromptSubmit',
        session_id: sessionId,
        cwd: '/projects/my-app',
        prompt,
    };
}

describe('UserPromptSubmitHandler', () => {
    let dnaEngine: DnaEngine;
    let handler: UserPromptSubmitHandler;

    beforeEach(() => {
        dnaEngine = makeDnaEngine();
        handler = new UserPromptSubmitHandler({ dnaEngine });
    });

    describe('correction detection', () => {
        it('detects "don\'t use classes" as correction and calls DNA engine', async () => {
            await handler.handle(makePayload("don't use classes"));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledWith(
                "don't use classes",
                'sess-1',
                'pattern',
            );
        });

        it('detects "do not use var" as correction', async () => {
            await handler.handle(makePayload('do not use var'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });

        it('detects "never use any" as correction', async () => {
            await handler.handle(makePayload('never use any'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });

        it('detects "stop using callbacks" as correction', async () => {
            await handler.handle(makePayload('stop using callbacks'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });

        it('detects "avoid nested ternaries" as correction', async () => {
            await handler.handle(makePayload('avoid nested ternaries'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });
    });

    describe('preference detection', () => {
        it('detects "prefer functions" as preference and calls DNA engine', async () => {
            await handler.handle(makePayload('prefer functions over classes'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledWith(
                'prefer functions over classes',
                'sess-1',
                'pattern',
            );
        });

        it('detects "instead of callbacks use promises" as preference', async () => {
            await handler.handle(makePayload('instead of callbacks use promises'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });

        it('detects "rather than classes use functions" as preference', async () => {
            await handler.handle(makePayload('rather than classes use functions'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });

        it('detects "switch to async/await" as preference', async () => {
            await handler.handle(makePayload('switch to async/await'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });
    });

    describe('reinforcement detection', () => {
        it('detects "yes exactly" as reinforcement and calls DNA engine', async () => {
            await handler.handle(makePayload('yes exactly, keep doing that'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });

        it('detects "perfect" as reinforcement', async () => {
            await handler.handle(makePayload('perfect, that is what I want'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });

        it('detects "that\'s right" as reinforcement', async () => {
            await handler.handle(makePayload("that's right, continue"));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });

        it('detects "keep doing this" as reinforcement', async () => {
            await handler.handle(makePayload('keep doing this pattern'));

            expect(dnaEngine.captureInstructionWithPatternMatch).toHaveBeenCalledTimes(1);
        });
    });

    describe('normal prompts (no pattern match)', () => {
        it('ignores "fix the login bug"', async () => {
            await handler.handle(makePayload('fix the login bug'));

            expect(dnaEngine.captureInstructionWithPatternMatch).not.toHaveBeenCalled();
        });

        it('ignores "add a new endpoint for users"', async () => {
            await handler.handle(makePayload('add a new endpoint for users'));

            expect(dnaEngine.captureInstructionWithPatternMatch).not.toHaveBeenCalled();
        });

        it('ignores "refactor the auth module"', async () => {
            await handler.handle(makePayload('refactor the auth module'));

            expect(dnaEngine.captureInstructionWithPatternMatch).not.toHaveBeenCalled();
        });

        it('ignores "what does this function do?"', async () => {
            await handler.handle(makePayload('what does this function do?'));

            expect(dnaEngine.captureInstructionWithPatternMatch).not.toHaveBeenCalled();
        });
    });

    describe('empty prompts', () => {
        it('handles empty string without calling DNA engine', async () => {
            await handler.handle(makePayload(''));

            expect(dnaEngine.captureInstructionWithPatternMatch).not.toHaveBeenCalled();
        });

        it('returns empty response for empty prompt', async () => {
            const result = await handler.handle(makePayload(''));

            expect(result).toEqual({});
        });
    });

    describe('response', () => {
        it('always returns empty response for matching prompts', async () => {
            const result = await handler.handle(makePayload("don't use classes"));

            expect(result).toEqual({});
        });

        it('always returns empty response for non-matching prompts', async () => {
            const result = await handler.handle(makePayload('fix the login bug'));

            expect(result).toEqual({});
        });

        it('returns empty response when DNA engine throws', async () => {
            (
                dnaEngine.captureInstructionWithPatternMatch as ReturnType<typeof vi.fn>
            ).mockRejectedValue(new Error('dna error'));

            const result = await handler.handle(makePayload("don't use classes"));

            expect(result).toEqual({});
        });
    });
});
