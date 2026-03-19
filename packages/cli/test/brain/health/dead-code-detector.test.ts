import { describe, it, expect } from 'vitest';
import { DeadCodeDetector } from '#brain/health/dead-code-detector.js';
import type { PreFetchedData } from '#brain/health/cycle-detector.js';

describe('DeadCodeDetector', () => {
    const detector = new DeadCodeDetector();

    it('returns empty when all functions are referenced', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:main',
                    type: 'function',
                    name: 'main',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                },
                {
                    id: 'fn:b.ts:helper',
                    type: 'function',
                    name: 'helper',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ],
            edges: [{ sourceId: 'fn:a.ts:main', targetId: 'fn:b.ts:helper', type: 'calls' }],
        };

        const dead = await detector.detect(data);
        expect(dead).toEqual([]);
    });

    it('detects unreferenced function', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:main',
                    type: 'function',
                    name: 'main',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                },
                {
                    id: 'fn:c.ts:orphan',
                    type: 'function',
                    name: 'orphan',
                    filePath: 'c.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
            ],
            edges: [],
        };

        const dead = await detector.detect(data);
        expect(dead.length).toBe(1);
        expect(dead[0].node.name).toBe('orphan');
    });

    it('detects unreferenced class', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'cls:a.ts:Foo',
                    type: 'class',
                    name: 'Foo',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 10,
                },
                {
                    id: 'cls:b.ts:Bar',
                    type: 'class',
                    name: 'Bar',
                    filePath: 'b.ts',
                    lineStart: 1,
                    lineEnd: 10,
                },
            ],
            edges: [{ sourceId: 'fn:c.ts:main', targetId: 'cls:a.ts:Foo', type: 'imports' }],
        };

        const dead = await detector.detect(data);
        expect(dead.length).toBe(1);
        expect(dead[0].node.name).toBe('Bar');
    });

    it('ignores methods, variables, types, interfaces', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'method:a.ts:Foo.bar',
                    type: 'method',
                    name: 'bar',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 3,
                },
                {
                    id: 'var:a.ts:x',
                    type: 'variable',
                    name: 'x',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 1,
                },
                {
                    id: 'type:a.ts:Config',
                    type: 'type',
                    name: 'Config',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                },
                {
                    id: 'iface:a.ts:Logger',
                    type: 'interface',
                    name: 'Logger',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                },
            ],
            edges: [],
        };

        const dead = await detector.detect(data);
        expect(dead).toEqual([]);
    });

    it('exempts exported functions', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:lib.ts:publicApi',
                    type: 'function',
                    name: 'publicApi',
                    filePath: 'lib.ts',
                    lineStart: 1,
                    lineEnd: 5,
                    isExported: true,
                },
                {
                    id: 'fn:lib.ts:internal',
                    type: 'function',
                    name: 'internal',
                    filePath: 'lib.ts',
                    lineStart: 6,
                    lineEnd: 10,
                    isExported: false,
                },
            ],
            edges: [],
        };

        const dead = await detector.detect(data);
        expect(dead.length).toBe(1);
        expect(dead[0].node.name).toBe('internal');
    });

    it('exempts exported classes', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'cls:svc.ts:Service',
                    type: 'class',
                    name: 'Service',
                    filePath: 'svc.ts',
                    lineStart: 1,
                    lineEnd: 20,
                    isExported: true,
                },
                {
                    id: 'cls:svc.ts:Helper',
                    type: 'class',
                    name: 'Helper',
                    filePath: 'svc.ts',
                    lineStart: 21,
                    lineEnd: 30,
                    isExported: false,
                },
            ],
            edges: [],
        };

        const dead = await detector.detect(data);
        expect(dead.length).toBe(1);
        expect(dead[0].node.name).toBe('Helper');
    });

    it('exempts entry point names', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:index.ts:main',
                    type: 'function',
                    name: 'main',
                    filePath: 'index.ts',
                    lineStart: 1,
                    lineEnd: 5,
                },
                {
                    id: 'fn:app.ts:start',
                    type: 'function',
                    name: 'start',
                    filePath: 'app.ts',
                    lineStart: 1,
                    lineEnd: 5,
                },
                {
                    id: 'fn:app.ts:unused',
                    type: 'function',
                    name: 'unused',
                    filePath: 'app.ts',
                    lineStart: 6,
                    lineEnd: 10,
                },
            ],
            edges: [],
        };

        const dead = await detector.detect(data);
        expect(dead.length).toBe(1);
        expect(dead[0].node.name).toBe('unused');
    });

    it('returns empty when no nodes', async () => {
        const dead = await detector.detect({ nodes: [], edges: [] });
        expect(dead).toEqual([]);
    });

    it('detects transitively dead code', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:dead',
                    type: 'function',
                    name: 'dead',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                },
                {
                    id: 'fn:a.ts:alsoDead',
                    type: 'function',
                    name: 'alsoDead',
                    filePath: 'a.ts',
                    lineStart: 6,
                    lineEnd: 10,
                },
            ],
            edges: [{ sourceId: 'fn:a.ts:alsoDead', targetId: 'fn:a.ts:dead', type: 'calls' }],
        };

        const dead = await detector.detect(data);
        const names = dead.map((d) => d.node.name);
        expect(names).toContain('dead');
        expect(names).toContain('alsoDead');
    });

    it('does not flag exported in transitive pass', async () => {
        const data: PreFetchedData = {
            nodes: [
                {
                    id: 'fn:a.ts:exported',
                    type: 'function',
                    name: 'exported',
                    filePath: 'a.ts',
                    lineStart: 1,
                    lineEnd: 5,
                    isExported: true,
                },
                {
                    id: 'fn:a.ts:deadCaller',
                    type: 'function',
                    name: 'deadCaller',
                    filePath: 'a.ts',
                    lineStart: 6,
                    lineEnd: 10,
                },
            ],
            edges: [
                { sourceId: 'fn:a.ts:deadCaller', targetId: 'fn:a.ts:exported', type: 'calls' },
            ],
        };

        const dead = await detector.detect(data);
        expect(dead.length).toBe(1);
        expect(dead[0].node.name).toBe('deadCaller');
    });
});
