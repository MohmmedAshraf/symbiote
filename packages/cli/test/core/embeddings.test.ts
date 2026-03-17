import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EmbeddingService } from '#core/embeddings.js';
import { createDatabase, type SymbioteDB } from '#storage/db.js';

describe('EmbeddingService', () => {
    let service: EmbeddingService;

    beforeAll(async () => {
        service = new EmbeddingService();
        await service.initialize();
    }, 60000);

    afterAll(() => service.dispose());

    it('generates a 384-dim vector from text', async () => {
        const vector = await service.embed('function handleAuth');
        expect(vector).toHaveLength(384);
        expect(typeof vector[0]).toBe('number');
    });

    it('generates different vectors for different inputs', async () => {
        const v1 = await service.embed('database connection pool');
        const v2 = await service.embed('React component render');
        expect(v1).not.toEqual(v2);
    });

    it('generates similar vectors for similar inputs', async () => {
        const v1 = await service.embed('validate user email');
        const v2 = await service.embed('check email validity');
        const v3 = await service.embed('render dashboard chart');
        const sim = (a: number[], b: number[]): number => {
            let dot = 0,
                na = 0,
                nb = 0;
            for (let i = 0; i < a.length; i++) {
                dot += a[i] * b[i];
                na += a[i] * a[i];
                nb += b[i] * b[i];
            }
            return dot / (Math.sqrt(na) * Math.sqrt(nb));
        };
        expect(sim(v1, v2)).toBeGreaterThan(sim(v1, v3));
    });

    it('builds embedding text from name + body', () => {
        const text = EmbeddingService.buildEmbeddingText(
            'validateEmail',
            'function validateEmail(email: string): boolean {\n    return email.includes("@");\n}',
        );
        expect(text).toContain('validateEmail');
        expect(text).toContain('function');
    });
});

describe('EmbeddingService.storeAndSearch', () => {
    let db: SymbioteDB;
    let service: EmbeddingService;

    beforeAll(async () => {
        service = new EmbeddingService();
        await service.initialize();
        db = await createDatabase(':memory:');
    }, 60000);

    afterAll(async () => {
        await db.close();
        service.dispose();
    });

    it('stores embeddings and retrieves via cosine similarity', async () => {
        const pairs = [
            ['fn:a:validateEmail', 'validate user email address'],
            ['fn:b:renderComponent', 'render React component'],
            ['fn:c:checkEmail', 'check email format'],
        ] as const;

        for (const [id, text] of pairs) {
            const v = await service.embed(text);
            await db.run(
                'INSERT OR REPLACE INTO embeddings (node_id, vector) VALUES ($1, $2::FLOAT[384])',
                id,
                JSON.stringify(Array.from(v)),
            );
        }

        const qv = await service.embed('email validation');
        const results = await db.all(
            'SELECT node_id, array_cosine_similarity(vector, $1::FLOAT[384]) as score FROM embeddings ORDER BY score DESC LIMIT 3',
            JSON.stringify(Array.from(qv)),
        );
        expect(results).toHaveLength(3);
        expect((results[0] as { node_id: string }).node_id).toMatch(/validateEmail|checkEmail/);
    });
});
