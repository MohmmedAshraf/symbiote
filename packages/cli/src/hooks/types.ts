export interface BaseHookPayload {
    session_id: string;
    cwd: string;
    hook_event_name: string;
}

export interface PreToolUsePayload {
    type: 'pre_tool_use';
    tool_name: string;
    tool_input: Record<string, unknown>;
    session_id?: string;
    cwd?: string;
}

export interface PostToolUsePayload {
    type: 'post_tool_use';
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_output: string;
    session_id?: string;
    cwd?: string;
}

export interface SessionStartPayload extends BaseHookPayload {
    source: 'startup' | 'resume' | 'clear' | 'compact';
    model: string;
}

export interface UserPromptSubmitPayload extends BaseHookPayload {
    prompt: string;
}

export interface PostToolUseFailurePayload extends BaseHookPayload {
    tool_name: string;
    tool_input: Record<string, unknown>;
    tool_use_id?: string;
    error: string;
    is_interrupt: boolean;
}

export interface SubagentStartPayload extends BaseHookPayload {
    agent_id: string;
    agent_type: string;
}

export interface PreCompactPayload extends BaseHookPayload {
    trigger: 'manual' | 'auto';
    custom_instructions: string;
}

export interface StopPayload extends BaseHookPayload {
    stop_hook_active: boolean;
    last_assistant_message: string;
}

export interface SessionEndPayload extends BaseHookPayload {
    reason: string;
}

export interface HttpHookResponse {
    hookSpecificOutput?: {
        hookEventName: string;
        additionalContext?: string;
        permissionDecision?: 'allow' | 'deny' | 'ask';
    };
}

export type HookPayload = PreToolUsePayload | PostToolUsePayload;

export interface HookResponse {
    decision: 'allow' | 'block';
    message?: string;
    additionalContext?: string;
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

import { createEvent } from '#events/types.js';
import type { EventType, EventData } from '#events/types.js';
import { sendEvent } from '#events/ipc.js';

export function fireHookEvent(type: EventType, data: EventData, port: number): Promise<void> {
    const event = createEvent(type, data);
    return sendEvent(event, port);
}
