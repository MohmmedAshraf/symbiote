import { useRef, useCallback } from 'react';
import type { SymbioteEvent } from '@/lib/events';

export interface NodeEffect {
    nodeId: string;
    type: 'glow' | 'pulse' | 'create';
    intensity: number;
    startedAt: number;
    duration: number;
}

const EFFECT_DURATIONS: Record<string, { type: NodeEffect['type']; duration: number }> = {
    'file:read': { type: 'glow', duration: 2000 },
    'file:edit': { type: 'pulse', duration: 3000 },
    'file:create': { type: 'create', duration: 4000 },
    'node:reindexed': { type: 'glow', duration: 1500 },
};

export function useNodeEffects(fileToNodeId: (filePath: string) => string | null) {
    const effects = useRef<Map<string, NodeEffect>>(new Map());

    const processEvent = useCallback(
        (event: SymbioteEvent) => {
            const config = EFFECT_DURATIONS[event.type];
            if (!config || !event.data.filePath) return;

            const nodeId = fileToNodeId(event.data.filePath);
            if (!nodeId) return;

            effects.current.set(nodeId, {
                nodeId,
                type: config.type,
                intensity: 1.0,
                startedAt: performance.now(),
                duration: config.duration,
            });
        },
        [fileToNodeId],
    );

    const getActiveEffects = useCallback((): Map<string, NodeEffect> => {
        const now = performance.now();
        const active = new Map<string, NodeEffect>();

        for (const [id, effect] of effects.current) {
            const elapsed = now - effect.startedAt;
            if (elapsed < effect.duration) {
                const progress = elapsed / effect.duration;
                active.set(id, { ...effect, intensity: 1.0 - progress });
            }
        }

        for (const [id] of effects.current) {
            if (!active.has(id)) {
                effects.current.delete(id);
            }
        }

        return active;
    }, []);

    return { processEvent, getActiveEffects };
}
