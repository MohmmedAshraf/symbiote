export const EVENT_TYPES = [
    'file:read',
    'file:edit',
    'file:create',
    'node:reindexed',
    'intelligence:finding',
    'intelligence:snapshot',
    'brain:metrics',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface EventData {
    filePath?: string;
    nodeIds?: string[];
    toolName?: string;
    metadata?: Record<string, unknown>;
}

export interface SymbioteEvent {
    type: EventType;
    timestamp: number;
    data: EventData;
}

export function createEvent(type: EventType, data: EventData): SymbioteEvent {
    return {
        type,
        timestamp: Date.now(),
        data,
    };
}
