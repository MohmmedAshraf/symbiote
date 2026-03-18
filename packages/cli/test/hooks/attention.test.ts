import { describe, it, expect, beforeEach } from 'vitest';
import { AttentionSet } from '#hooks/attention.js';

describe('AttentionSet', () => {
    let attention: AttentionSet;

    beforeEach(() => {
        attention = new AttentionSet();
    });

    describe('file tracking', () => {
        it('tracks a new file with accessCount 1', () => {
            attention.touchFile('/src/auth.ts');
            const entry = attention.getFile('/src/auth.ts');
            expect(entry).toBeDefined();
            expect(entry!.accessCount).toBe(1);
            expect(entry!.lastAccess).toBe(0);
        });

        it('increments accessCount on repeated touch', () => {
            attention.touchFile('/src/auth.ts');
            attention.touchFile('/src/auth.ts');
            attention.touchFile('/src/auth.ts');
            expect(attention.getFile('/src/auth.ts')!.accessCount).toBe(3);
        });

        it('returns undefined for untracked file', () => {
            expect(attention.getFile('/src/unknown.ts')).toBeUndefined();
        });

        it('updates lastAccess to current tick on touch', () => {
            attention.tick();
            attention.tick();
            attention.touchFile('/src/auth.ts');
            expect(attention.getFile('/src/auth.ts')!.lastAccess).toBe(2);
        });
    });

    describe('symbol tracking', () => {
        it('tracks a new symbol with accessCount 1', () => {
            attention.touchSymbol('fn:src/auth.ts:login');
            const entry = attention.getSymbol('fn:src/auth.ts:login');
            expect(entry).toBeDefined();
            expect(entry!.accessCount).toBe(1);
        });

        it('increments accessCount on repeated touch', () => {
            attention.touchSymbol('fn:src/auth.ts:login');
            attention.touchSymbol('fn:src/auth.ts:login');
            expect(attention.getSymbol('fn:src/auth.ts:login')!.accessCount).toBe(2);
        });

        it('returns undefined for untracked symbol', () => {
            expect(attention.getSymbol('fn:src/auth.ts:unknown')).toBeUndefined();
        });
    });

    describe('topFiles', () => {
        it('returns files sorted by accessCount descending', () => {
            attention.touchFile('/src/auth.ts');
            attention.touchFile('/src/db.ts');
            attention.touchFile('/src/db.ts');
            attention.touchFile('/src/db.ts');
            attention.touchFile('/src/auth.ts');

            const top = attention.topFiles(2);
            expect(top[0]).toBe('/src/db.ts');
            expect(top[1]).toBe('/src/auth.ts');
        });

        it('limits result to n files', () => {
            attention.touchFile('/src/a.ts');
            attention.touchFile('/src/b.ts');
            attention.touchFile('/src/c.ts');
            expect(attention.topFiles(2)).toHaveLength(2);
        });

        it('returns all files when n exceeds file count', () => {
            attention.touchFile('/src/a.ts');
            expect(attention.topFiles(10)).toHaveLength(1);
        });
    });

    describe('decay', () => {
        it('prunes entries not accessed within 50 ticks', () => {
            attention.touchFile('/src/old.ts');
            for (let i = 0; i < 51; i++) {
                attention.tick();
            }
            expect(attention.getFile('/src/old.ts')).toBeUndefined();
        });

        it('retains entries accessed within 50 ticks', () => {
            attention.touchFile('/src/recent.ts');
            for (let i = 0; i < 49; i++) {
                attention.tick();
            }
            expect(attention.getFile('/src/recent.ts')).toBeDefined();
        });

        it('retains entry re-touched after initial tick drift', () => {
            attention.touchFile('/src/active.ts');
            for (let i = 0; i < 30; i++) {
                attention.tick();
            }
            attention.touchFile('/src/active.ts');
            for (let i = 0; i < 40; i++) {
                attention.tick();
            }
            expect(attention.getFile('/src/active.ts')).toBeDefined();
        });

        it('prunes symbols not accessed within 50 ticks', () => {
            attention.touchSymbol('fn:src/auth.ts:login');
            for (let i = 0; i < 51; i++) {
                attention.tick();
            }
            expect(attention.getSymbol('fn:src/auth.ts:login')).toBeUndefined();
        });
    });

    describe('activeDirectory', () => {
        it('returns empty string when no files are tracked', () => {
            expect(attention.activeDirectory()).toBe('');
        });

        it('returns the directory containing the most files', () => {
            attention.touchFile('/src/auth/login.ts');
            attention.touchFile('/src/auth/logout.ts');
            attention.touchFile('/src/auth/session.ts');
            attention.touchFile('/src/db/query.ts');

            expect(attention.activeDirectory()).toBe('/src/auth/');
        });

        it('returns a trailing slash in the directory path', () => {
            attention.touchFile('/src/utils/helper.ts');
            expect(attention.activeDirectory()).toBe('/src/utils/');
        });

        it('handles single file', () => {
            attention.touchFile('/src/index.ts');
            expect(attention.activeDirectory()).toBe('/src/');
        });
    });

    describe('allFiles and allSymbols', () => {
        it('returns all tracked file paths', () => {
            attention.touchFile('/src/a.ts');
            attention.touchFile('/src/b.ts');
            expect(attention.allFiles()).toHaveLength(2);
            expect(attention.allFiles()).toContain('/src/a.ts');
            expect(attention.allFiles()).toContain('/src/b.ts');
        });

        it('returns all tracked symbol IDs', () => {
            attention.touchSymbol('fn:a:foo');
            attention.touchSymbol('fn:b:bar');
            expect(attention.allSymbols()).toHaveLength(2);
            expect(attention.allSymbols()).toContain('fn:a:foo');
            expect(attention.allSymbols()).toContain('fn:b:bar');
        });
    });

    describe('toSnapshot', () => {
        it('serializes all tracked data', () => {
            attention.touchFile('/src/auth.ts');
            attention.touchSymbol('fn:src/auth.ts:login');

            const snapshot = attention.toSnapshot();

            expect(snapshot.filesModified).toContain('/src/auth.ts');
            expect(snapshot.symbolsChanged).toContain('fn:src/auth.ts:login');
            expect(snapshot.activeAttention).toBe('/src/');
        });

        it('returns empty arrays and empty string when nothing tracked', () => {
            const snapshot = attention.toSnapshot();
            expect(snapshot.filesModified).toHaveLength(0);
            expect(snapshot.symbolsChanged).toHaveLength(0);
            expect(snapshot.activeAttention).toBe('');
        });
    });

    describe('clear', () => {
        it('resets files, symbols, and tickCount', () => {
            attention.touchFile('/src/auth.ts');
            attention.touchSymbol('fn:src/auth.ts:login');
            attention.tick();
            attention.tick();

            attention.clear();

            expect(attention.allFiles()).toHaveLength(0);
            expect(attention.allSymbols()).toHaveLength(0);
            expect(attention.toSnapshot().activeAttention).toBe('');
        });

        it('allows fresh tracking after clear', () => {
            attention.touchFile('/src/auth.ts');
            attention.clear();
            attention.touchFile('/src/new.ts');

            expect(attention.getFile('/src/auth.ts')).toBeUndefined();
            expect(attention.getFile('/src/new.ts')).toBeDefined();
            expect(attention.getFile('/src/new.ts')!.lastAccess).toBe(0);
        });
    });
});
