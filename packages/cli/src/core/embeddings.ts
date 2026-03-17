import type { SymbioteDB } from '../storage/db.js';
import type { NodeRecord } from '../storage/repository.js';

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
        let count = 0;
        for (const node of nodes) {
            if (node.type === 'file') continue;
            const source = sourceByFile.get(node.filePath);
            const body = source
                ? source
                      .split('\n')
                      .slice(node.lineStart - 1, node.lineEnd)
                      .join('\n')
                : undefined;
            const text = EmbeddingService.buildEmbeddingText(node.name, body);
            const vector = await this.embed(text);
            await db.run(
                'INSERT OR REPLACE INTO embeddings (node_id, vector) VALUES ($1, $2::FLOAT[384])',
                node.id,
                JSON.stringify(vector),
            );
            count++;
        }
        return count;
    }

    async clearForFile(db: SymbioteDB, filePath: string): Promise<void> {
        await db.run(
            'DELETE FROM embeddings WHERE node_id IN (SELECT id FROM nodes WHERE file_path = $1)',
            filePath,
        );
    }
}
