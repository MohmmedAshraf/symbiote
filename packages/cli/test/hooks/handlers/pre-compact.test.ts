import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PreCompactHandler } from '#hooks/handlers/pre-compact.js';
import { AttentionSet } from '#hooks/attention.js';
import { EventBus } from '#events/bus.js';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { SessionStore } from '#hooks/session-store.js';
import type { PreCompactPayload } from '#hooks/types.js';
import type { SymbioteEvent } from '#events/types.js';

const BASE_PAYLOAD: PreCompactPayload = {
    hook_event_name: 'PreCompact',
    session_id: 'test-session-compact-1',
    cwd: '/projects/my-app',
    trigger: 'auto',
    custom_instructions: '',
};

describe('PreCompactHandler', () => {
    let db: SymbioteDB;
    let sessionStore: SessionStore;
    let attention: AttentionSet;
    let eventBus: EventBus;
    let handler: PreCompactHandler;
    let emittedEvents: SymbioteEvent[];
    const SESSION_ID = 'test-session-compact-1';

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        sessionStore = new SessionStore(db);
        await sessionStore.startSession(SESSION_ID, Date.now());

        attention = new AttentionSet();
        eventBus = new EventBus();
        emittedEvents = [];

        eventBus.on('*', (event) => {
            emittedEvents.push(event);
        });

        handler = new PreCompactHandler({
            sessionStore,
            attention,
            eventBus,
            sessionId: SESSION_ID,
        });
    });

    afterEach(async () => {
        await db.close();
    });

    it('saves snapshot to SessionStore', async () => {
        attention.touchFile('src/auth.ts');
        attention.touchFile('src/db.ts');

        await handler.handle(BASE_PAYLOAD);

        const snapshot = await sessionStore.getSnapshot(SESSION_ID);
        expect(snapshot).not.toBeNull();
        const parsed = JSON.parse(snapshot!);
        expect(parsed.filesModified).toContain('src/auth.ts');
        expect(parsed.filesModified).toContain('src/db.ts');
    });

    it('returns helpful additionalContext', async () => {
        const result = await handler.handle(BASE_PAYLOAD);

        expect(result.hookSpecificOutput?.additionalContext).toContain('get_project_overview');
        expect(result.hookSpecificOutput?.additionalContext).toContain('get_context_for_file');
        expect(result.hookSpecificOutput?.additionalContext).toContain('Symbiote');
    });

    it('fires intelligence:snapshot event', async () => {
        await handler.handle(BASE_PAYLOAD);

        expect(emittedEvents.some((e) => e.type === 'intelligence:snapshot')).toBe(true);
    });

    it('sets hookEventName to PreCompact', async () => {
        const result = await handler.handle(BASE_PAYLOAD);

        expect(result.hookSpecificOutput?.hookEventName).toBe('PreCompact');
    });

    it('handles empty attention set gracefully', async () => {
        const result = await handler.handle(BASE_PAYLOAD);

        expect(result.hookSpecificOutput?.additionalContext).toBeDefined();
        const snapshot = await sessionStore.getSnapshot(SESSION_ID);
        expect(snapshot).not.toBeNull();
        const parsed = JSON.parse(snapshot!);
        expect(parsed.filesModified).toEqual([]);
    });
});
