import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type SynapseDB } from '../../../src/storage/db.js';
import { Repository } from '../../../src/storage/repository.js';
import { CouplingAnalyzer } from '../../../src/brain/health/coupling-analyzer.js';

describe('CouplingAnalyzer', () => {
    let db: SynapseDB;
    let repo: Repository;
    let analyzer: CouplingAnalyzer;

    beforeEach(() => {
        db = createDatabase(':memory:');
        repo = new Repository(db);
        analyzer = new CouplingAnalyzer(repo);
    });

    afterEach(() => {
        db.close();
    });

    it('returns empty array when graph has no edges', () => {
        repo.insertNodes([
            { id: 'fn:a.ts:foo', type: 'function', name: 'foo', filePath: 'a.ts', lineStart: 1, lineEnd: 3 },
        ]);

        const hotspots = analyzer.detect();
        expect(hotspots).toEqual([]);
    });

    it('returns empty array when coupling is below threshold', () => {
        repo.insertNodes([
            { id: 'fn:a.ts:foo', type: 'function', name: 'foo', filePath: 'a.ts', lineStart: 1, lineEnd: 3 },
            { id: 'fn:b.ts:bar', type: 'function', name: 'bar', filePath: 'b.ts', lineStart: 1, lineEnd: 3 },
        ]);
        repo.insertEdges([
            { sourceId: 'fn:a.ts:foo', targetId: 'fn:b.ts:bar', type: 'calls' },
        ]);

        const hotspots = analyzer.detect();
        expect(hotspots).toEqual([]);
    });

    it('detects a file with disproportionate incoming edges', () => {
        const nodes = [];
        const edges = [];

        nodes.push({ id: 'fn:hub.ts:hub', type: 'function', name: 'hub', filePath: 'hub.ts', lineStart: 1, lineEnd: 3 });

        for (let i = 0; i < 10; i++) {
            const file = `caller${i}.ts`;
            const id = `fn:${file}:fn${i}`;
            nodes.push({ id, type: 'function', name: `fn${i}`, filePath: file, lineStart: 1, lineEnd: 3 });
            edges.push({ sourceId: id, targetId: 'fn:hub.ts:hub', type: 'calls' });
        }

        repo.insertNodes(nodes);
        repo.insertEdges(edges);

        const hotspots = analyzer.detect();
        expect(hotspots.length).toBeGreaterThanOrEqual(1);
        expect(hotspots[0].filePath).toBe('hub.ts');
        expect(hotspots[0].incomingEdges).toBe(10);
    });

    it('sorts hotspots by total edge count descending', () => {
        const nodes = [];
        const edges = [];

        nodes.push({ id: 'fn:big.ts:big', type: 'function', name: 'big', filePath: 'big.ts', lineStart: 1, lineEnd: 3 });
        nodes.push({ id: 'fn:small.ts:small', type: 'function', name: 'small', filePath: 'small.ts', lineStart: 1, lineEnd: 3 });

        for (let i = 0; i < 10; i++) {
            const file = `src${i}.ts`;
            const id = `fn:${file}:fn${i}`;
            nodes.push({ id, type: 'function', name: `fn${i}`, filePath: file, lineStart: 1, lineEnd: 3 });
            edges.push({ sourceId: id, targetId: 'fn:big.ts:big', type: 'calls' });
        }

        for (let i = 0; i < 8; i++) {
            const file = `other${i}.ts`;
            const id = `fn:${file}:fn${i}`;
            nodes.push({ id, type: 'function', name: `fn${i}`, filePath: file, lineStart: 1, lineEnd: 3 });
            edges.push({ sourceId: id, targetId: 'fn:small.ts:small', type: 'calls' });
        }

        repo.insertNodes(nodes);
        repo.insertEdges(edges);

        const hotspots = analyzer.detect();
        if (hotspots.length >= 2) {
            expect(hotspots[0].totalEdges).toBeGreaterThanOrEqual(hotspots[1].totalEdges);
        }
    });
});
