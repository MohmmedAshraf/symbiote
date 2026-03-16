export interface PreToolUsePayload {
    type: 'pre_tool_use';
    tool_name: string;
    tool_input: Record<string, unknown>;
}

export interface PostToolUsePayload {
    type: 'post_tool_use';
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_output: string;
}

export type HookPayload = PreToolUsePayload | PostToolUsePayload;

export interface HookResponse {
    decision: 'allow' | 'block';
    message?: string;
}

export function readStdinPayload(): Promise<HookPayload> {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk: string) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            try {
                resolve(JSON.parse(data) as HookPayload);
            } catch (err) {
                reject(new Error(`Failed to parse hook payload: ${err}`));
            }
        });
        process.stdin.on('error', reject);
    });
}

export function writeResponse(response: HookResponse): void {
    process.stdout.write(JSON.stringify(response) + '\n');
}

import { createEvent } from '../events/types.js';
import type { EventType, EventData } from '../events/types.js';
import { sendEvent } from '../events/ipc.js';

export function fireHookEvent(type: EventType, data: EventData, port: number): Promise<void> {
    const event = createEvent(type, data);
    return sendEvent(event, port);
}
