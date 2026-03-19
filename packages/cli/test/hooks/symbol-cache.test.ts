import { describe, it, expect } from 'vitest';
import { SymbolCache } from '#hooks/symbol-cache.js';

describe('SymbolCache', () => {
    it('should store and retrieve symbols by name', () => {
        const cache = new SymbolCache();
        cache.set('createMcpServer', { filePath: 'src/mcp/server.ts', line: 56, kind: 'function' });
        const result = cache.get('createMcpServer');
        expect(result).toEqual({ filePath: 'src/mcp/server.ts', line: 56, kind: 'function' });
    });

    it('should return undefined for unknown symbols', () => {
        const cache = new SymbolCache();
        expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should rebuild from node list', () => {
        const cache = new SymbolCache();
        cache.rebuild([
            { name: 'foo', filePath: 'a.ts', lineStart: 1, kind: 'function' },
            { name: 'bar', filePath: 'b.ts', lineStart: 10, kind: 'class' },
        ]);
        expect(cache.get('foo')).toEqual({ filePath: 'a.ts', line: 1, kind: 'function' });
        expect(cache.get('bar')).toEqual({ filePath: 'b.ts', line: 10, kind: 'class' });
    });

    it('should clear on rebuild', () => {
        const cache = new SymbolCache();
        cache.set('old', { filePath: 'x.ts', line: 1, kind: 'function' });
        cache.rebuild([]);
        expect(cache.get('old')).toBeUndefined();
    });
});
