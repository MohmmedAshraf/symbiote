import type { UserPromptSubmitPayload, HttpHookResponse } from '#hooks/types.js';
import type { HybridSearch } from '#core/search.js';
import type { GraphQuery } from '#core/graph.js';

const MIN_PROMPT_LENGTH = 10;
const RELEVANCE_THRESHOLD = 0.3;
const MAX_RESULTS = 3;

export interface UserPromptSubmitConfig {
    search: Pick<HybridSearch, 'search'>;
    graph: Pick<GraphQuery, 'getDependents'>;
}

export class UserPromptSubmitHandler {
    private search: UserPromptSubmitConfig['search'];
    private graph: UserPromptSubmitConfig['graph'];

    constructor(config: UserPromptSubmitConfig) {
        this.search = config.search;
        this.graph = config.graph;
    }

    async handle(payload: UserPromptSubmitPayload): Promise<HttpHookResponse> {
        try {
            const prompt = payload.prompt?.trim() ?? '';
            if (prompt.length < MIN_PROMPT_LENGTH) return {};

            const results = await this.search.search(prompt, { limit: 5 });
            const relevant = results.filter((r) => r.score >= RELEVANCE_THRESHOLD);
            if (relevant.length === 0) return {};

            const lines: string[] = ['Relevant code context:'];
            const top = relevant.slice(0, MAX_RESULTS);

            for (const r of top) {
                const node = r.node;
                if (!node) continue;

                let line = `  - ${node.name} (${node.type}, ${node.filePath}:${node.lineStart})`;

                const dependents = await this.graph.getDependents(node.name);
                if (dependents.length > 0) {
                    line += ` — ${dependents.length} dependents`;
                }
                lines.push(line);
            }

            if (lines.length <= 1) return {};

            return {
                hookSpecificOutput: {
                    hookEventName: 'UserPromptSubmit',
                    additionalContext: lines.join('\n'),
                },
            };
        } catch {
            return {};
        }
    }
}
