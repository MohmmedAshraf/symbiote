import type { GraphData, NodeContext, HealthReport, DnaEntry } from './types';

const BASE_URL = '/api';

async function request<T>(
    path: string,
    options?: RequestInit
): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`API error ${res.status}: ${body}`);
    }

    return res.json();
}

export const api = {
    graph: {
        getData: () => request<GraphData>('/graph'),
        getNodeContext: (nodeId: string) =>
            request<NodeContext>(
                `/graph/nodes/${encodeURIComponent(nodeId)}`
            ),
    },

    health: {
        getReport: () => request<HealthReport>('/health'),
    },

    dna: {
        list: () => request<DnaEntry[]>('/dna'),
        update: (
            id: string,
            data: { status?: string; content?: string }
        ) =>
            request<DnaEntry>(
                `/dna/${encodeURIComponent(id)}`,
                {
                    method: 'PATCH',
                    body: JSON.stringify(data),
                }
            ),
    },

    chat: {
        send: async function* (
            message: string
        ): AsyncGenerator<string> {
            const res = await fetch(`${BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });

            if (!res.ok) {
                throw new Error(`Chat error ${res.status}`);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                yield decoder.decode(value, { stream: true });
            }
        },
    },
};
