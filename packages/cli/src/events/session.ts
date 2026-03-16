import type { SymbioteEvent } from './types.js';

export interface Session {
    id: string;
    startedAt: number;
    lastEventAt: number;
    filesTouched: string[];
    eventCount: number;
}

export interface SessionSummary {
    sessionId: string | null;
    filesTouched: string[];
    eventCount: number;
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export class SessionTracker {
    private session: Session | null = null;

    processEvent(event: SymbioteEvent): void {
        const now = event.timestamp;

        if (!this.session || now - this.session.lastEventAt > SESSION_TIMEOUT_MS) {
            this.session = {
                id: `session-${now}`,
                startedAt: now,
                lastEventAt: now,
                filesTouched: [],
                eventCount: 0,
            };
        }

        this.session.lastEventAt = now;
        this.session.eventCount++;

        const filePath = event.data.filePath;
        if (filePath && !this.session.filesTouched.includes(filePath)) {
            this.session.filesTouched.push(filePath);
        }
    }

    currentSession(): Session | null {
        return this.session;
    }

    summary(): SessionSummary {
        if (!this.session) {
            return { sessionId: null, filesTouched: [], eventCount: 0 };
        }
        return {
            sessionId: this.session.id,
            filesTouched: [...this.session.filesTouched],
            eventCount: this.session.eventCount,
        };
    }
}
