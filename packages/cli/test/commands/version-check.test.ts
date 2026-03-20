import { describe, it, expect } from 'vitest';
import {
    isServerVersionStale,
    SERVER_VERSION,
    type ServerHealthInfo,
} from '../../src/commands/shared.js';

describe('isServerVersionStale', () => {
    it('returns false when versions match', () => {
        const health: ServerHealthInfo = {
            status: 'ok',
            version: SERVER_VERSION,
            startedAt: Date.now(),
        };
        expect(isServerVersionStale(health)).toBe(false);
    });

    it('returns true when versions differ', () => {
        const health: ServerHealthInfo = {
            status: 'ok',
            version: '0.0.0-old',
            startedAt: Date.now(),
        };
        expect(isServerVersionStale(health)).toBe(true);
    });

    it('returns false when server has no version (legacy server)', () => {
        const health: ServerHealthInfo = { status: 'ok' };
        expect(isServerVersionStale(health)).toBe(false);
    });
});
