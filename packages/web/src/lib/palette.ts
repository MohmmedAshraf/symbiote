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
