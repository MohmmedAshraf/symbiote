import { describe, it, expect, beforeEach } from 'vitest';
import { SessionTracker } from '../../src/events/session.js';
import { createEvent } from '../../src/events/types.js';

describe('SessionTracker', () => {
    let tracker: SessionTracker;

    beforeEach(() => {
        tracker = new SessionTracker();
    });

    it('creates a session on first event', () => {
        tracker.processEvent(createEvent('file:read', { filePath: 'src/a.ts' }));
        const session = tracker.currentSession();
        expect(session).not.toBeNull();
        expect(session!.id).toMatch(/^session-\d+$/);
        expect(session!.filesTouched).toContain('src/a.ts');
    });

    it('tracks files touched', () => {
        tracker.processEvent(createEvent('file:read', { filePath: 'src/a.ts' }));
        tracker.processEvent(createEvent('file:edit', { filePath: 'src/b.ts' }));
        tracker.processEvent(createEvent('file:read', { filePath: 'src/c.ts' }));
        const session = tracker.currentSession()!;
        expect(session.filesTouched).toEqual(new Set(['src/a.ts', 'src/b.ts', 'src/c.ts']));
    });

    it('does not duplicate files in touch set', () => {
        tracker.processEvent(createEvent('file:read', { filePath: 'src/a.ts' }));
        tracker.processEvent(createEvent('file:read', { filePath: 'src/a.ts' }));
        const session = tracker.currentSession()!;
        expect(session.filesTouched).toEqual(new Set(['src/a.ts']));
    });

    it('tracks event count', () => {
        tracker.processEvent(createEvent('file:read', { filePath: 'src/a.ts' }));
        tracker.processEvent(createEvent('file:edit', { filePath: 'src/b.ts' }));
        const session = tracker.currentSession()!;
        expect(session.eventCount).toBe(2);
    });

    it('returns null when no session exists', () => {
        expect(tracker.currentSession()).toBeNull();
    });

    it('provides session summary for SSE reconnection', () => {
        tracker.processEvent(createEvent('file:read', { filePath: 'src/a.ts' }));
        tracker.processEvent(createEvent('file:edit', { filePath: 'src/b.ts' }));
        const summary = tracker.summary();
        expect(summary.filesTouched).toEqual(['src/a.ts', 'src/b.ts']);
        expect(summary.eventCount).toBe(2);
    });
});
