import type { SymbioteDB } from '../storage/db.js';
import type { Repository, NodeRecord } from '../storage/repository.js';
import { EmbeddingService } from './embeddings.js';

export interface SearchResult {
    node: NodeRecord;
    score: number;
    source: 'text' | 'vector' | 'hybrid';
}

interface RankedItem {
    nodeId: string;
    score: number;
}

export interface SearchOptions {
    limit?: number;
    useVector?: boolean;
}

export class HybridSearch {
    private ftsReady = false;

    constructor(
        private db: SymbioteDB,
        private repo: Repository,
    ) {}

    async textSearch(query: string, limit: number = 20): Promise<SearchResult[]> {
        await this.ensureFts();

        const rows = (await this.db.all(
            `SELECT node_id, MAX(score) as score FROM (
                SELECT *, fts_main_nodes_fts.match_bm25(node_id, $1, fields := 'name') as score
                FROM nodes_fts WHERE score IS NOT NULL
                UNION ALL
                SELECT *, fts_main_nodes_fts.match_bm25(node_id, $1, fields := 'file_path') as score
                FROM nodes_fts WHERE score IS NOT NULL
            ) GROUP BY node_id ORDER BY score DESC LIMIT $2`,
            query,
            limit,
        )) as Array<{ node_id: string; score: number }>;

        if (rows.length === 0) return this.fallback(query, limit);

        const results: SearchResult[] = [];
        for (const row of rows) {
            const node = await this.repo.getNodeById(row.node_id);
            if (node) results.push({ node, score: row.score, source: 'text' });
        }
        return results;
    }

    async vectorSearch(query: string, limit: number = 20): Promise<SearchResult[]> {
        const svc = new EmbeddingService();
        try {
            await svc.initialize();
            const qv = await svc.embed(query);
            const rows = (await this.db.all(
                `SELECT e.node_id, array_cosine_similarity(e.vector, $1::FLOAT[384]) as score
                 FROM embeddings e WHERE e.vector IS NOT NULL ORDER BY score DESC LIMIT $2`,
                JSON.stringify(qv),
                limit,
            )) as Array<{ node_id: string; score: number }>;

            const results: SearchResult[] = [];
            for (const row of rows) {
                const node = await this.repo.getNodeById(row.node_id);
                if (node) results.push({ node, score: row.score, source: 'vector' });
            }
            return results;
        } finally {
            svc.dispose();
        }
    }

    async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
        const limit = options.limit ?? 20;
        const textResults = await this.textSearch(query, limit * 2);
        const textRanked: RankedItem[] = textResults.map((r) => ({
            nodeId: r.node.id,
            score: r.score,
        }));

        let vectorRanked: RankedItem[] = [];
        if (options.useVector !== false) {
            const hasEmb = await this.hasEmbeddings();
            if (hasEmb) {
                const vr = await this.vectorSearch(query, limit * 2);
                vectorRanked = vr.map((r) => ({ nodeId: r.node.id, score: r.score }));
            }
        }

        if (vectorRanked.length === 0) return textResults.slice(0, limit);

        const fused = HybridSearch.rrfFuse(textRanked, vectorRanked);
        const results: SearchResult[] = [];
        for (const item of fused.slice(0, limit)) {
            const node = await this.repo.getNodeById(item.nodeId);
            if (node) results.push({ node, score: item.score, source: 'hybrid' });
        }
        return results;
    }

    static rrfFuse(listA: RankedItem[], listB: RankedItem[], k: number = 60): RankedItem[] {
        const scores = new Map<string, number>();
        listA.forEach((item, rank) =>
            scores.set(item.nodeId, (scores.get(item.nodeId) ?? 0) + 1 / (k + rank + 1)),
        );
        listB.forEach((item, rank) =>
            scores.set(item.nodeId, (scores.get(item.nodeId) ?? 0) + 1 / (k + rank + 1)),
        );
        return Array.from(scores.entries())
            .map(([nodeId, score]) => ({ nodeId, score }))
            .sort((a, b) => b.score - a.score);
    }

    private async ensureFts(): Promise<void> {
        if (this.ftsReady) return;
        try {
            await this.db.exec('DROP TABLE IF EXISTS nodes_fts;');
            await this.db.exec(
                'CREATE TABLE nodes_fts AS SELECT id as node_id, name, file_path FROM nodes;',
            );
            await this.db.exec(
                "PRAGMA create_fts_index('nodes_fts', 'node_id', 'name', 'file_path');",
            );
            this.ftsReady = true;
        } catch {
            this.ftsReady = false;
        }
    }

    private async fallback(query: string, limit: number): Promise<SearchResult[]> {
        const nodes = await this.repo.searchNodesByName(query);
        return nodes.slice(0, limit).map((node, i) => ({
            node,
            score: 1 / (i + 1),
            source: 'text' as const,
        }));
    }

    private async hasEmbeddings(): Promise<boolean> {
        try {
            const rows = await this.db.all('SELECT COUNT(*) as count FROM embeddings');
            return (rows[0] as { count: number }).count > 0;
        } catch {
            return false;
        }
    }
}
