import { describe, it, expect } from 'vitest';
import { cosineSimilarity, EmbeddingModel } from '#dna/embeddings.js';

describe('cosineSimilarity', () => {
    it('returns 1.0 for identical vectors', () => {
        const a = [1, 0, 0];
        const b = [1, 0, 0];
        expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
    });

    it('returns 0.0 for orthogonal vectors', () => {
        const a = [1, 0, 0];
        const b = [0, 1, 0];
        expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
    });

    it('returns -1.0 for opposite vectors', () => {
        const a = [1, 0, 0];
        const b = [-1, 0, 0];
        expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
    });

    it('handles real-valued vectors', () => {
        const a = [0.5, 0.5, 0.0];
        const b = [0.4, 0.6, 0.0];
        const sim = cosineSimilarity(a, b);
        expect(sim).toBeGreaterThan(0.9);
        expect(sim).toBeLessThanOrEqual(1.0);
    });

    it('returns 0.0 for zero vectors', () => {
        const a = [0, 0, 0];
        const b = [1, 0, 0];
        expect(cosineSimilarity(a, b)).toBe(0);
    });
});

describe('EmbeddingModel', () => {
    let model: EmbeddingModel;

    it('can be instantiated', () => {
        model = new EmbeddingModel();
        expect(model).toBeDefined();
    });

    it('generates embeddings for text', async () => {
        model = new EmbeddingModel();
        const embedding = await model.embed('Use early returns in functions.');
        expect(embedding).toBeDefined();
        expect(embedding.length).toBe(384);
        expect(typeof embedding[0]).toBe('number');
    }, 60000);

    it('produces similar embeddings for similar text', async () => {
        model = new EmbeddingModel();
        const a = await model.embed('Use early returns to exit functions.');
        const b = await model.embed('Always return early from functions instead of nesting.');
        const c = await model.embed('The weather is sunny today.');

        const simAB = cosineSimilarity(a, b);
        const simAC = cosineSimilarity(a, c);

        expect(simAB).toBeGreaterThan(simAC);
        expect(simAB).toBeGreaterThan(0.5);
    }, 60000);

    it('can batch embed multiple texts', async () => {
        model = new EmbeddingModel();
        const embeddings = await model.embedBatch([
            'Use early returns.',
            'Prefer Drizzle over Prisma.',
            'No nested ternaries.',
        ]);

        expect(embeddings).toHaveLength(3);
        expect(embeddings[0].length).toBe(384);
        expect(embeddings[1].length).toBe(384);
        expect(embeddings[2].length).toBe(384);
    }, 60000);
});
