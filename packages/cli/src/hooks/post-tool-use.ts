import path from 'node:path';
import { PostToolUsePayload, HookResponse } from './types.js';

export interface PostToolUseConfig {
    projectRoot: string;
    onReindexFile: (relativePath: string) => Promise<void>;
    onFullRescan: () => Promise<void>;
}

export class PostToolUseHandler {
    private config: PostToolUseConfig;

    constructor(config: PostToolUseConfig) {
        this.config = config;
    }

    async handle(payload: PostToolUsePayload): Promise<HookResponse> {
        try {
            if (payload.tool_name === 'Edit' || payload.tool_name === 'Write') {
                const filePath =
                    typeof payload.tool_input.file_path === 'string'
                        ? payload.tool_input.file_path
                        : undefined;
                if (filePath) {
                    const relativePath = path.relative(this.config.projectRoot, filePath);
                    await this.config.onReindexFile(relativePath);
                }
            }

            if (payload.tool_name === 'Bash') {
                const command =
                    typeof payload.tool_input.command === 'string'
                        ? payload.tool_input.command
                        : undefined;
                if (command && /git\s+commit/.test(command)) {
                    await this.config.onFullRescan();
                }
            }
        } catch {
            // Hooks must never fail
        }

        return { decision: 'allow' };
    }
}
