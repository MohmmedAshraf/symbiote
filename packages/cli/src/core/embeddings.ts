import type { SymbioteDB } from '#storage/db.js';
import type { NodeRecord } from '#storage/repository.js';

type PoolingType = 'none' | 'mean' | 'cls';

type Extractor = (
    text: string,
    opts: { pooling: PoolingType; normalize: boolean },
) => Promise<{ data: Float32Array }>;

async function loadExtractor(model: string): Promise<Extractor> {
    const { pipeline } = await import('@huggingface/transformers');
    const extractor = await pipeline('feature-extraction', model, { dtype: 'fp32' });
    return (text: string, opts: { pooling: PoolingType; normalize: boolean }) =>
        extractor(text, opts) as Promise<{ data: Float32Array }>;
}

export class EmbeddingService {
    private extractor: Extractor | null = null;

    async initialize(): Promise<void> {
        this.extractor = await loadExtractor('Xenova/all-MiniLM-L6-v2');
    }

    async embed(text: string): Promise<number[]> {
        if (!this.extractor) throw new Error('EmbeddingService not initialized.');
        const result = await this.extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(result.data);
    }

    dispose(): void {
        this.extractor = null;
    }

    static buildEmbeddingText(name: string, body?: string): string {
        if (!body) return name;
        return `${name}\n${body.split('\n').slice(0, 3).join('\n')}`;
    }

    async generateForNodes(
        db: SymbioteDB,
        nodes: NodeRecord[],
        sourceByFile: Map<string, string>,
    ): Promise<number> {
        const BATCH_SIZE = 50;
        const eligible: { id: string; text: string }[] = [];

        for (const node of nodes) {
            if (node.type === 'file') continue;
            const source = sourceByFile.get(node.filePath);
            const body = source
                ? source
                      .split('\n')
                      .slice(node.lineStart - 1, node.lineEnd)
                      .join('\n')
                : undefined;
            eligible.push({
                id: node.id,
                text: EmbeddingService.buildEmbeddingText(node.name, body),
            });
        }

        const CONCURRENCY = 6;
        for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
            const batch = eligible.slice(i, i + BATCH_SIZE);
            const vectors: number[][] = [];
            for (let c = 0; c < batch.length; c += CONCURRENCY) {
                const chunk = batch.slice(c, c + CONCURRENCY);
                const results = await Promise.all(chunk.map((item) => this.embed(item.text)));
                vectors.push(...results);
            }

            const placeholders = batch
                .map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2}::FLOAT[384])`)
                .join(', ');
            const params = batch.flatMap((item, idx) => [item.id, JSON.stringify(vectors[idx])]);

            await db.run(
                `INSERT OR REPLACE INTO embeddings (node_id, vector) VALUES ${placeholders}`,
                ...params,
            );
        }

        return eligible.length;
    }

    async clearForFile(db: SymbioteDB, filePath: string): Promise<void> {
        await db.run(
            'DELETE FROM embeddings WHERE node_id IN (SELECT id FROM nodes WHERE file_path = $1)',
            filePath,
        );
    }
}
