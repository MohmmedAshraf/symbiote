import type { UserPromptSubmitPayload, HttpHookResponse } from '#hooks/types.js';

export class UserPromptSubmitHandler {
    async handle(_payload: UserPromptSubmitPayload): Promise<HttpHookResponse> {
        return {};
    }
}
