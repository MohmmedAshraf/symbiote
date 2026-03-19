import type { GraphData, NodeContext, HealthReport, DnaEntry } from './types';
import type { BrainMetrics } from './brain-metrics';
import type {
    CortexGraphData,
    CortexNodeContext,
    CortexHealthReport,
    ExecutionFlow,
    IntelligenceFinding,
    ToolResponse,
} from './cortex-types';

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

interface UnwrappedResponse<T> {
    data: T;
    depth: number;
    deepening: boolean;
    staleSince?: string;
}

async function unwrap<T>(response: Response): Promise<UnwrappedResponse<T>> {
    const json = await response.json();
    if (json && typeof json === 'object' && 'data' in json) {
        return json as ToolResponse<T>;
    }
    return { data: json as T, depth: 0, deepening: false };
}

async function requestUnwrapped<T>(path: string): Promise<UnwrappedResponse<T>> {
    const headers: Record<string, string> = {};
    const res = await fetch(`${BASE_URL}${path}`, { headers });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`API error ${res.status}: ${body}`);
    }
    return unwrap<T>(res);
}

export const api = {
    graph: {
        getData: () => request<GraphData>('/graph'),
        getCortexData: () => requestUnwrapped<CortexGraphData>('/graph'),
        getNodeContext: (nodeId: string) =>
            request<NodeContext>(`/graph/nodes/${encodeURIComponent(nodeId)}`),
        getCortexNodeContext: (nodeId: string) =>
            requestUnwrapped<CortexNodeContext>(`/graph/nodes/${encodeURIComponent(nodeId)}`),
        getFlows: () => requestUnwrapped<ExecutionFlow[]>('/graph/flows'),
        getFlow: (id: string) =>
            requestUnwrapped<ExecutionFlow>(`/graph/flows/${encodeURIComponent(id)}`),
        getArchitecture: () =>
            requestUnwrapped<{ layers: string[]; boundaries: unknown[] }>('/graph/architecture'),
    },

    health: {
        getReport: () => request<HealthReport>('/health'),
        getCortexReport: () => requestUnwrapped<CortexHealthReport>('/health'),
    },

    findings: {
        list: () => requestUnwrapped<IntelligenceFinding[]>('/findings'),
        forNode: (nodeId: string) =>
            requestUnwrapped<IntelligenceFinding[]>(`/findings/node/${encodeURIComponent(nodeId)}`),
    },

    brain: {
        getMetrics: () => request<BrainMetrics>('/brain/metrics'),
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
