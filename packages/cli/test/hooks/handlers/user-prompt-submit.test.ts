import { describe, it, expect } from 'vitest';
import { UserPromptSubmitHandler } from '#hooks/handlers/user-prompt-submit.js';
import type { UserPromptSubmitPayload } from '#hooks/types.js';

function makePayload(prompt: string, sessionId = 'sess-1'): UserPromptSubmitPayload {
    return {
        hook_event_name: 'UserPromptSubmit',
        session_id: sessionId,
        cwd: '/projects/my-app',
        prompt,
    };
}

describe('UserPromptSubmitHandler', () => {
    it('returns empty response', async () => {
        const handler = new UserPromptSubmitHandler();
        const result = await handler.handle(makePayload('fix the login bug'));

        expect(result).toEqual({});
    });

    it('returns empty response for empty prompt', async () => {
        const handler = new UserPromptSubmitHandler();
        const result = await handler.handle(makePayload(''));

        expect(result).toEqual({});
    });
});
