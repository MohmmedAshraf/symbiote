import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../src/events/bus.js';
import { createEvent } from '../../src/events/types.js';

describe('EventBus', () => {
    let bus: EventBus;

    beforeEach(() => {
        bus = new EventBus();
    });

    it('delivers events to subscribers', () => {
        const handler = vi.fn();
        bus.on('file:read', handler);
        const event = createEvent('file:read', { filePath: 'src/auth.ts' });
        bus.emit(event);
        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith(event);
    });

    it('does not deliver events of wrong type', () => {
        const handler = vi.fn();
        bus.on('file:read', handler);
        bus.emit(createEvent('file:edit', { filePath: 'src/auth.ts' }));
        expect(handler).not.toHaveBeenCalled();
    });

    it('wildcard * receives all events', () => {
        const handler = vi.fn();
        bus.on('*', handler);
        bus.emit(createEvent('file:read', {}));
        bus.emit(createEvent('file:edit', {}));
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('unsubscribes with off()', () => {
        const handler = vi.fn();
        bus.on('file:read', handler);
        bus.off('file:read', handler);
        bus.emit(createEvent('file:read', {}));
        expect(handler).not.toHaveBeenCalled();
    });

    it('supports multiple handlers for same event type', () => {
        const h1 = vi.fn();
        const h2 = vi.fn();
        bus.on('file:read', h1);
        bus.on('file:read', h2);
        bus.emit(createEvent('file:read', {}));
        expect(h1).toHaveBeenCalledOnce();
        expect(h2).toHaveBeenCalledOnce();
    });

    it('does not throw when emitting with no subscribers', () => {
        expect(() => bus.emit(createEvent('file:read', {}))).not.toThrow();
    });

    it('handler errors do not crash the bus', () => {
        const bad = vi.fn().mockImplementation(() => {
            throw new Error('boom');
        });
        const good = vi.fn();
        bus.on('file:read', bad);
        bus.on('file:read', good);
        bus.emit(createEvent('file:read', {}));
        expect(bad).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
    });
});
