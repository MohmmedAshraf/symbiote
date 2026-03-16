import type { SymbioteEvent, EventType } from './types.js';

type EventHandler = (event: SymbioteEvent) => void;

export class EventBus {
    private handlers = new Map<string, Set<EventHandler>>();

    on(type: EventType | '*', handler: EventHandler): void {
        const set = this.handlers.get(type) ?? new Set();
        set.add(handler);
        this.handlers.set(type, set);
    }

    off(type: EventType | '*', handler: EventHandler): void {
        this.handlers.get(type)?.delete(handler);
    }

    emit(event: SymbioteEvent): void {
        const typed = this.handlers.get(event.type);
        const wildcard = this.handlers.get('*');

        if (typed) {
            for (const handler of [...typed]) {
                try {
                    handler(event);
                } catch {
                    /* */
                }
            }
        }

        if (wildcard) {
            for (const handler of [...wildcard]) {
                try {
                    handler(event);
                } catch {
                    /* */
                }
            }
        }
    }
}
