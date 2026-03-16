import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { Scanner } from '../../src/core/scanner.js';
import { createDatabase, type SymbioteDB } from '../../src/storage/db.js';
import { Repository } from '../../src/storage/repository.js';

const FIXTURES = path.join(import.meta.dirname, '../fixtures');

describe('Scanner', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let scanner: Scanner;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
        scanner = new Scanner(repo);
    });

    afterEach(async () => {
        await db.close();
    });

    it('scans a simple JS project and populates the graph', async () => {
        const result = await scanner.scan(
            path.join(FIXTURES, 'simple-project')
        );

        expect(result.filesScanned).toBeGreaterThan(0);
        expect(result.nodesCreated).toBeGreaterThan(0);

        const stats = await repo.getStats();
        expect(stats.nodes).toBeGreaterThan(0);
        expect(stats.files).toBeGreaterThan(0);
    });

    it('scans a TypeScript project', async () => {
        const result = await scanner.scan(
            path.join(FIXTURES, 'ts-project')
        );

        expect(result.filesScanned).toBeGreaterThan(0);
        expect(result.nodesCreated).toBeGreaterThan(0);

        const stats = await repo.getStats();
        expect(stats.nodes).toBeGreaterThan(0);
    });

    it('skips unchanged files on second scan', async () => {
        const first = await scanner.scan(
            path.join(FIXTURES, 'simple-project')
        );
        const second = await scanner.scan(
            path.join(FIXTURES, 'simple-project')
        );

        expect(second.filesScanned).toBe(0);
        expect(second.filesSkipped).toBe(first.filesScanned);
    });

    it('rescans everything when force=true', async () => {
        await scanner.scan(path.join(FIXTURES, 'simple-project'));
        const second = await scanner.scan(
            path.join(FIXTURES, 'simple-project'),
            { force: true }
        );

        expect(second.filesScanned).toBeGreaterThan(0);
        expect(second.filesSkipped).toBe(0);
    });
});
