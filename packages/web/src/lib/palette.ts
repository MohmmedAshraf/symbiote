import type { NodeKind, EdgeKind, ArchitecturalLayer } from './cortex-types';

export const NODE_KIND_COLORS: Record<NodeKind, string> = {
    function: '#34d399',
    class: '#c084fc',
    method: '#a78bfa',
    interface: '#22d3ee',
    type: '#fbbf24',
    variable: '#fb923c',
    file: '#60a5fa',
    module: '#38bdf8',
};

export const EDGE_KIND_COLORS: Record<EdgeKind, string> = {
    calls: '#34d399',
    imports: '#60a5fa',
    extends: '#c084fc',
    implements: '#22d3ee',
    contains: '#475569',
    flows_to: '#f472b6',
    reads: '#fbbf24',
    writes: '#fb923c',
    returns: '#a78bfa',
};

export const LAYER_COLORS: Record<ArchitecturalLayer, string> = {
    controller: '#60a5fa',
    service: '#34d399',
    repository: '#fbbf24',
    database: '#fb923c',
    utility: '#94a3b8',
    unknown: '#475569',
};

export const LAYER_ORDER: ArchitecturalLayer[] = [
    'controller',
    'service',
    'repository',
    'database',
    'utility',
];

export const COMMUNITY_PALETTE = [
    '#60a5fa',
    '#34d399',
    '#c084fc',
    '#fbbf24',
    '#f87171',
    '#22d3ee',
    '#f472b6',
    '#a3e635',
    '#fb923c',
    '#a78bfa',
    '#2dd4bf',
    '#e879f9',
    '#facc15',
    '#fb7185',
    '#86efac',
    '#67e8f9',
    '#c4b5fd',
    '#fca5a5',
    '#38bdf8',
    '#fde68a',
];

export function getCommunityColor(community: number): string {
    return COMMUNITY_PALETTE[community % COMMUNITY_PALETTE.length];
}
