import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

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
    private extractor: FeatureExtractionPipeline | null = null;

    async embed(text: string): Promise<number[]> {
        const extractor = await this.getExtractor();
        const output = await extractor(text, {
            pooling: 'mean',
            normalize: true,
        });
        return Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIM);
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        const extractor = await this.getExtractor();
        const results: number[][] = [];

        for (const text of texts) {
            const output = await extractor(text, {
                pooling: 'mean',
                normalize: true,
            });
            results.push(Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIM));
        }

        return results;
    }

    private async getExtractor(): Promise<FeatureExtractionPipeline> {
        if (!this.extractor) {
            this.extractor = (await pipeline(
                'feature-extraction' as 'feature-extraction',
                MODEL_NAME,
                { dtype: 'fp32' },
            )) as unknown as FeatureExtractionPipeline;
        }
        return this.extractor;
    }
}

export { EMBEDDING_DIM };
