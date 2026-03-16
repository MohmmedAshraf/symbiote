import type { SymbioteDB } from '../storage/db.js';
import type { NodeRecord } from '../storage/repository.js';

type Pipeline = (
    input: string,
    opts?: { pooling: string; normalize: boolean },
) => Promise<{ data: Float32Array }>;

export class EmbeddingService {
    private pipeline: Pipeline | null = null;

    async initialize(): Promise<void> {
        const { pipeline } = await import('@huggingface/transformers');
        this.pipeline = (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            dtype: 'fp32',
        })) as unknown as Pipeline;
    }

    async embed(text: string): Promise<number[]> {
        if (!this.pipeline) throw new Error('EmbeddingService not initialized.');
        const result = await this.pipeline(text, { pooling: 'mean', normalize: true });
        return Array.from(result.data);
    }

    dispose(): void {
        this.pipeline = null;
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
