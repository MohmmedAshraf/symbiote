import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { Scanner } from '#core/scanner.js';
import { createDatabase, type SymbioteDB } from '#storage/db.js';
import { Repository } from '#storage/repository.js';

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
        const result = await scanner.scan(path.join(FIXTURES, 'simple-project'));

        expect(result.filesScanned).toBeGreaterThan(0);
        expect(result.nodesCreated).toBeGreaterThan(0);

        const stats = await repo.getStats();
        expect(stats.nodes).toBeGreaterThan(0);
        expect(stats.files).toBeGreaterThan(0);
    });

    it('scans a TypeScript project', async () => {
        const result = await scanner.scan(path.join(FIXTURES, 'ts-project'));

        expect(result.filesScanned).toBeGreaterThan(0);
        expect(result.nodesCreated).toBeGreaterThan(0);

        const stats = await repo.getStats();
        expect(stats.nodes).toBeGreaterThan(0);
    });

    it('skips unchanged files on second scan', async () => {
        const first = await scanner.scan(path.join(FIXTURES, 'simple-project'));
        const second = await scanner.scan(path.join(FIXTURES, 'simple-project'));

        expect(second.filesScanned).toBe(0);
        expect(second.filesSkipped).toBe(first.filesScanned);
    });

    it('rescans everything when force=true', async () => {
        await scanner.scan(path.join(FIXTURES, 'simple-project'));
        const second = await scanner.scan(path.join(FIXTURES, 'simple-project'), { force: true });

        expect(second.filesScanned).toBeGreaterThan(0);
        expect(second.filesSkipped).toBe(0);
    });
});

describe('Scanner with embeddings', () => {
    let db: SymbioteDB;
    let repo: Repository;
    let scanner: Scanner;

    beforeEach(async () => {
        db = await createDatabase(':memory:');
        repo = new Repository(db);
        scanner = new Scanner(repo, db);
    });

    afterEach(async () => {
        await db.close();
    });

    it('generates embeddings when --embeddings flag is set', async () => {
        const result = await scanner.scan(path.join(FIXTURES, 'simple-project'), {
            embeddings: true,
        });
        expect(result.embeddingsGenerated).toBeGreaterThan(0);
        const rows = await db.all('SELECT COUNT(*) as count FROM embeddings');
        expect((rows[0] as { count: number }).count).toBeGreaterThan(0);
    }, 60000);

    it('skips embeddings by default', async () => {
        const result = await scanner.scan(path.join(FIXTURES, 'simple-project'));
        expect(result.embeddingsGenerated).toBe(0);
    });

    it('only regenerates embeddings for changed files', async () => {
        await scanner.scan(path.join(FIXTURES, 'simple-project'), { embeddings: true });
        const result = await scanner.scan(path.join(FIXTURES, 'simple-project'), {
            embeddings: true,
        });
        expect(result.embeddingsGenerated).toBe(0);
        expect(result.filesSkipped).toBeGreaterThan(0);
    }, 60000);
});
