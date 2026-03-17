import { describe, it, expect } from 'vitest';
import {
    getCommunityColor,
    COMMUNITY_PALETTE,
    NODE_KIND_COLORS,
    LAYER_ORDER,
} from '../src/lib/palette';

describe('palette', () => {
    it('cycles community colors', () => {
        expect(getCommunityColor(0)).toBe(COMMUNITY_PALETTE[0]);
        expect(getCommunityColor(20)).toBe(COMMUNITY_PALETTE[0]);
    });

    it('has colors for all node kinds', () => {
        const kinds = [
            'function',
            'class',
            'method',
            'interface',
            'type',
            'variable',
            'file',
            'module',
        ];
        for (const kind of kinds) {
            expect(NODE_KIND_COLORS[kind as keyof typeof NODE_KIND_COLORS]).toMatch(
                /^#[0-9a-f]{6}$/i,
            );
        }
    });

    it('layer order has 5 layers', () => {
        expect(LAYER_ORDER).toHaveLength(5);
    });
});
