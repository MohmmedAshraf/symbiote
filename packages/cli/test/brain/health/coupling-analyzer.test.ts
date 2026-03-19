import { describe, it, expect } from 'vitest';
import { CouplingAnalyzer } from '#brain/health/coupling-analyzer.js';
import type { PreFetchedData } from '#brain/health/cycle-detector.js';
import type { NodeRecord, EdgeRecord } from '#storage/repository.js';

function makeNode(file: string, name: string): NodeRecord {
    return {
        id: `fn:${file}:${name}`,
        type: 'function',
        name,
        filePath: file,
        lineStart: 1,
        lineEnd: 3,
    };
}

describe('CouplingAnalyzer', () => {
    const analyzer = new CouplingAnalyzer();

    it('returns empty array when graph has no edges', async () => {
        const data: PreFetchedData = {
            nodes: [makeNode('a.ts', 'foo')],
            edges: [],
        };

        const hotspots = await analyzer.detect(data);
        expect(hotspots).toEqual([]);
    });

    it('returns empty array when coupling is below threshold', async () => {
        const data: PreFetchedData = {
            nodes: [makeNode('a.ts', 'foo'), makeNode('b.ts', 'bar')],
            edges: [{ sourceId: 'fn:a.ts:foo', targetId: 'fn:b.ts:bar', type: 'calls' }],
        };

        const hotspots = await analyzer.detect(data);
        expect(hotspots).toEqual([]);
    });

    it('detects a file with disproportionate incoming edges', async () => {
        const nodes: NodeRecord[] = [makeNode('hub.ts', 'hub')];
        const edges: EdgeRecord[] = [];

        for (let i = 0; i < 10; i++) {
            const file = `caller${i}.ts`;
            nodes.push(makeNode(file, `fn${i}`));
            edges.push({
                sourceId: `fn:${file}:fn${i}`,
                targetId: 'fn:hub.ts:hub',
                type: 'calls',
            });
        }

        const hotspots = await analyzer.detect({ nodes, edges });
        expect(hotspots.length).toBeGreaterThanOrEqual(1);
        expect(hotspots[0].filePath).toBe('hub.ts');
        expect(hotspots[0].incomingEdges).toBe(10);
        expect(hotspots[0].fanIn).toBe(10);
        expect(hotspots[0].fanOut).toBe(0);
        expect(hotspots[0].kind).toBe('fan-in');
    });

    it('sorts hotspots by total edge count descending', async () => {
        const nodes: NodeRecord[] = [makeNode('big.ts', 'big'), makeNode('small.ts', 'small')];
        const edges: EdgeRecord[] = [];

        for (let i = 0; i < 10; i++) {
            const file = `src${i}.ts`;
            nodes.push(makeNode(file, `fn${i}`));
            edges.push({
                sourceId: `fn:${file}:fn${i}`,
                targetId: 'fn:big.ts:big',
                type: 'calls',
            });
        }

        for (let i = 0; i < 8; i++) {
            const file = `other${i}.ts`;
            nodes.push(makeNode(file, `fn${i}`));
            edges.push({
                sourceId: `fn:${file}:fn${i}`,
                targetId: 'fn:small.ts:small',
                type: 'calls',
            });
        }

        const hotspots = await analyzer.detect({ nodes, edges });
        if (hotspots.length >= 2) {
            expect(hotspots[0].totalEdges).toBeGreaterThanOrEqual(hotspots[1].totalEdges);
        }
    });

    it('uses 90th percentile threshold instead of hardcoded value', async () => {
        const nodes: NodeRecord[] = [makeNode('hub.ts', 'hub')];
        const edges: EdgeRecord[] = [];

        for (let i = 0; i < 5; i++) {
            const file = `caller${i}.ts`;
            nodes.push(makeNode(file, `fn${i}`));
            edges.push({
                sourceId: `fn:${file}:fn${i}`,
                targetId: 'fn:hub.ts:hub',
                type: 'calls',
            });
        }

        for (let i = 0; i < 20; i++) {
            const fileA = `low_a${i}.ts`;
            const fileB = `low_b${i}.ts`;
            nodes.push(makeNode(fileA, `la${i}`));
            nodes.push(makeNode(fileB, `lb${i}`));
            edges.push({
                sourceId: `fn:${fileA}:la${i}`,
                targetId: `fn:${fileB}:lb${i}`,
                type: 'calls',
            });
        }

        const hotspots = await analyzer.detect({ nodes, edges });
        expect(hotspots.length).toBeGreaterThanOrEqual(1);
        expect(hotspots[0].filePath).toBe('hub.ts');
    });

    it('reports fan-in and fan-out separately', async () => {
        const nodes: NodeRecord[] = [makeNode('center.ts', 'center')];
        const edges: EdgeRecord[] = [];

        for (let i = 0; i < 6; i++) {
            const file = `in${i}.ts`;
            nodes.push(makeNode(file, `in${i}`));
            edges.push({
                sourceId: `fn:${file}:in${i}`,
                targetId: 'fn:center.ts:center',
                type: 'calls',
            });
        }

        for (let i = 0; i < 4; i++) {
            const file = `out${i}.ts`;
            nodes.push(makeNode(file, `out${i}`));
            edges.push({
                sourceId: 'fn:center.ts:center',
                targetId: `fn:${file}:out${i}`,
                type: 'calls',
            });
        }

        for (let i = 0; i < 15; i++) {
            const fileA = `bg_a${i}.ts`;
            const fileB = `bg_b${i}.ts`;
            nodes.push(makeNode(fileA, `bga${i}`));
            nodes.push(makeNode(fileB, `bgb${i}`));
            edges.push({
                sourceId: `fn:${fileA}:bga${i}`,
                targetId: `fn:${fileB}:bgb${i}`,
                type: 'calls',
            });
        }

        const hotspots = await analyzer.detect({ nodes, edges });
        const center = hotspots.find((h) => h.filePath === 'center.ts');
        expect(center).toBeDefined();
        expect(center!.fanIn).toBe(6);
        expect(center!.fanOut).toBe(4);
        expect(center!.incomingEdges).toBe(6);
        expect(center!.outgoingEdges).toBe(4);
        expect(center!.kind).toBe('both');
    });

    it('weights calls edges higher than imports edges', async () => {
        const nodes: NodeRecord[] = [
            makeNode('calls-hub.ts', 'chub'),
            makeNode('imports-hub.ts', 'ihub'),
        ];
        const edges: EdgeRecord[] = [];

        for (let i = 0; i < 6; i++) {
            const callFile = `c${i}.ts`;
            nodes.push(makeNode(callFile, `c${i}`));
            edges.push({
                sourceId: `fn:${callFile}:c${i}`,
                targetId: 'fn:calls-hub.ts:chub',
                type: 'calls',
            });
        }

        for (let i = 0; i < 6; i++) {
            const impFile = `imp${i}.ts`;
            nodes.push(makeNode(impFile, `imp${i}`));
            edges.push({
                sourceId: `fn:${impFile}:imp${i}`,
                targetId: 'fn:imports-hub.ts:ihub',
                type: 'imports',
            });
        }

        for (let i = 0; i < 15; i++) {
            const fileA = `pad_a${i}.ts`;
            const fileB = `pad_b${i}.ts`;
            nodes.push(makeNode(fileA, `pa${i}`));
            nodes.push(makeNode(fileB, `pb${i}`));
            edges.push({
                sourceId: `fn:${fileA}:pa${i}`,
                targetId: `fn:${fileB}:pb${i}`,
                type: 'calls',
            });
        }

        const hotspots = await analyzer.detect({ nodes, edges });
        const callsHub = hotspots.find((h) => h.filePath === 'calls-hub.ts');
        const importsHub = hotspots.find((h) => h.filePath === 'imports-hub.ts');

        expect(callsHub).toBeDefined();
        expect(callsHub!.weightedCount).toBe(6);
        if (importsHub) {
            expect(importsHub.weightedCount).toBe(3);
        }
        expect(callsHub!.weightedCount).toBeGreaterThan(importsHub?.weightedCount ?? 0);
    });

    it('flags fan-in only when just inbound exceeds threshold', async () => {
        const nodes: NodeRecord[] = [makeNode('sink.ts', 'sink')];
        const edges: EdgeRecord[] = [];

        for (let i = 0; i < 8; i++) {
            const file = `src${i}.ts`;
            nodes.push(makeNode(file, `s${i}`));
            edges.push({
                sourceId: `fn:${file}:s${i}`,
                targetId: 'fn:sink.ts:sink',
                type: 'calls',
            });
        }

        for (let i = 0; i < 15; i++) {
            const fileA = `bg_x${i}.ts`;
            const fileB = `bg_y${i}.ts`;
            nodes.push(makeNode(fileA, `bx${i}`));
            nodes.push(makeNode(fileB, `by${i}`));
            edges.push({
                sourceId: `fn:${fileA}:bx${i}`,
                targetId: `fn:${fileB}:by${i}`,
                type: 'calls',
            });
        }

        const hotspots = await analyzer.detect({ nodes, edges });
        const sink = hotspots.find((h) => h.filePath === 'sink.ts');
        expect(sink).toBeDefined();
        expect(sink!.kind).toBe('fan-in');
        expect(sink!.fanIn).toBe(8);
        expect(sink!.fanOut).toBe(0);
    });

    it('flags fan-out only when just outbound exceeds threshold', async () => {
        const nodes: NodeRecord[] = [makeNode('source.ts', 'source')];
        const edges: EdgeRecord[] = [];

        for (let i = 0; i < 8; i++) {
            const file = `dep${i}.ts`;
            nodes.push(makeNode(file, `d${i}`));
            edges.push({
                sourceId: 'fn:source.ts:source',
                targetId: `fn:${file}:d${i}`,
                type: 'calls',
            });
        }

        for (let i = 0; i < 15; i++) {
            const fileA = `bg_m${i}.ts`;
            const fileB = `bg_n${i}.ts`;
            nodes.push(makeNode(fileA, `bm${i}`));
            nodes.push(makeNode(fileB, `bn${i}`));
            edges.push({
                sourceId: `fn:${fileA}:bm${i}`,
                targetId: `fn:${fileB}:bn${i}`,
                type: 'calls',
            });
        }

        const hotspots = await analyzer.detect({ nodes, edges });
        const source = hotspots.find((h) => h.filePath === 'source.ts');
        expect(source).toBeDefined();
        expect(source!.kind).toBe('fan-out');
        expect(source!.fanOut).toBe(8);
        expect(source!.fanIn).toBe(0);
    });

    it('applies minimum threshold of 4 even when p90 is lower', async () => {
        const data: PreFetchedData = {
            nodes: [makeNode('a.ts', 'a'), makeNode('b.ts', 'b'), makeNode('c.ts', 'c')],
            edges: [
                { sourceId: 'fn:a.ts:a', targetId: 'fn:b.ts:b', type: 'calls' },
                { sourceId: 'fn:a.ts:a', targetId: 'fn:c.ts:c', type: 'calls' },
                { sourceId: 'fn:b.ts:b', targetId: 'fn:c.ts:c', type: 'calls' },
            ],
        };

        const hotspots = await analyzer.detect(data);
        expect(hotspots).toEqual([]);
    });
});
