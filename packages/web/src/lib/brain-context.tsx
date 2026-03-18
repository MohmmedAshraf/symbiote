import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import type { BrainState, Lobe } from '@/views/brain/brain-types';
import { DEFAULT_BRAIN_STATE } from '@/views/brain/brain-types';

interface BrainContextValue {
    brainState: BrainState;
    lobes: Lobe[];
    isReady: boolean;
    isPlaying: boolean;
    updateBrainState: (state: BrainState) => void;
    updateLobes: (lobes: Lobe[]) => void;
    setIsReady: (ready: boolean) => void;
    setIsPlaying: (playing: boolean) => void;
}

const BrainContext = createContext<BrainContextValue | null>(null);

export function BrainProvider({ children }: { children: ReactNode }) {
    const [brainState, setBrainState] = useState<BrainState>(DEFAULT_BRAIN_STATE);
    const [lobes, setLobes] = useState<Lobe[]>([]);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(true);

    const value = useMemo(
        () => ({
            brainState,
            lobes,
            isReady,
            isPlaying,
            updateBrainState: setBrainState,
            updateLobes: setLobes,
            setIsReady,
            setIsPlaying,
        }),
        [brainState, lobes, isReady, isPlaying],
    );

    return <BrainContext value={value}>{children}</BrainContext>;
}

export function useBrain(): BrainContextValue {
    const ctx = useContext(BrainContext);
    if (!ctx) throw new Error('useBrain must be used within BrainProvider');
    return ctx;
}
