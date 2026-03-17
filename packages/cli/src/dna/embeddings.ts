import { pipeline } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

type PoolingType = 'none' | 'mean' | 'cls';

type ExtractorInput = string | string[];

type Extractor = (
    input: ExtractorInput,
    opts: { pooling: PoolingType; normalize: boolean },
) => Promise<{ data: Float32Array }>;

export function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return dotProduct / denominator;
}

export class EmbeddingModel {
    private extractor: Extractor | null = null;

    async embed(text: string): Promise<number[]> {
        const extractor = await this.getExtractor();
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data).slice(0, EMBEDDING_DIM);
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];

        const extractor = await this.getExtractor();
        const output = await extractor(texts, { pooling: 'mean', normalize: true });
        const flat = Array.from(output.data);
        const results: number[][] = [];

        for (let i = 0; i < texts.length; i++) {
            results.push(flat.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM));
        }

        return results;
    }

    private async getExtractor(): Promise<Extractor> {
        if (!this.extractor) {
            const raw = await pipeline('feature-extraction', MODEL_NAME, { dtype: 'fp32' });
            this.extractor = (input, opts) => raw(input, opts) as Promise<{ data: Float32Array }>;
        }
        return this.extractor;
    }
}

export { EMBEDDING_DIM };
