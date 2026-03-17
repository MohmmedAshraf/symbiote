import type { GraphData, NodeContext, HealthReport, DnaEntry } from './types';

const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {};
    if (options?.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${BASE_URL}${path}`, {
        headers,
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
            request<NodeContext>(`/graph/nodes/${encodeURIComponent(nodeId)}`),
    },

    health: {
        getReport: () => request<HealthReport>('/health'),
    },

    dna: {
        list: () => request<DnaEntry[]>('/dna'),
        update: (id: string, data: { status?: string; content?: string }) =>
            request<DnaEntry>(`/dna/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            }),
    },
};
