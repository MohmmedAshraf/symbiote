import { describe, it, expect } from 'vitest';
import { createEvent, EVENT_TYPES } from '../../src/events/types.js';

describe('Event Types', () => {
    it('creates a well-formed event', () => {
        const event = createEvent('file:read', {
            filePath: 'src/auth.ts',
            toolName: 'Read',
        });

        expect(event.type).toBe('file:read');
        expect(event.timestamp).toBeTypeOf('number');
        expect(event.data.filePath).toBe('src/auth.ts');
        expect(event.data.toolName).toBe('Read');
    });

    it('includes all expected event types', () => {
        const expected = [
            'file:read',
            'file:edit',
            'file:create',
            'node:reindexed',
            'scan:complete',
            'correction:detected',
            'dna:recorded',
            'dna:promoted',
            'context:cluster',
            'constraint:violated',
            'impact:ripple',
            'connection:restored',
        ];
        for (const type of expected) {
            expect(EVENT_TYPES).toContain(type);
        }
    });

    it('defaults optional data fields to undefined', () => {
        const event = createEvent('scan:complete', {});
        expect(event.data.filePath).toBeUndefined();
        expect(event.data.nodeIds).toBeUndefined();
        expect(event.data.toolName).toBeUndefined();
    });
});
