import { useEffect, useRef, useCallback } from 'react';
import { useEvents } from '@/lib/events-context';
import { useBrain } from '@/lib/brain-context';
import { api } from '@/lib/api';
import { BrainRenderer } from './brain-renderer';
import type { BrainState, Lobe } from './brain-types';

export function BrainView() {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<BrainRenderer | null>(null);
    const { lastEvent } = useEvents();
    const { isPlaying, setIsPlaying, updateBrainState, updateLobes, setIsReady, isReady, lobes } =
        useBrain();

    const stateCallbackRef = useRef<(state: BrainState) => void>(updateBrainState);
    stateCallbackRef.current = updateBrainState;

    const stableCallback = useCallback((state: BrainState) => {
        stateCallbackRef.current(state);
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        let disposed = false;
        const container = containerRef.current;

        api.graph
            .getCortexData()
            .then(({ data }) => {
                if (disposed) return;
                const renderer = new BrainRenderer(container, stableCallback);
                renderer.init(data);
                rendererRef.current = renderer;
                updateLobes(renderer.getLobes());
                setIsReady(true);
            })
            .catch(() => {
                if (!disposed) setIsReady(false);
            });

        return () => {
            disposed = true;
            rendererRef.current?.dispose();
            rendererRef.current = null;
        };
    }, [stableCallback, updateLobes, setIsReady]);

    useEffect(() => {
        if (!lastEvent || !rendererRef.current) return;
        rendererRef.current.processEvent(lastEvent);
    }, [lastEvent]);

    useEffect(() => {
        rendererRef.current?.setPlaying(isPlaying);
    }, [isPlaying]);

    const handleZoom = useCallback((z: number) => {
        rendererRef.current?.setZoom(z);
    }, []);

    return (
        <div className="relative h-full w-full bg-slate-950">
            <div ref={containerRef} className="absolute inset-0" />

            {!isReady && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950">
                    <svg
                        width={40}
                        height={40}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#34d399"
                        strokeWidth={2}
                        className="animate-spin opacity-40"
                    >
                        <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                </div>
            )}

            {/* Bottom controls */}
            <div className="absolute right-0 bottom-0 left-0 z-10 flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-1.5">
                    <span className="mr-1.5 text-[8px] font-semibold tracking-[1.5px] text-slate-600">
                        ZOOM
                    </span>
                    {(
                        [
                            [50, 'Deep'],
                            [200, 'Close'],
                            [580, 'Default'],
                            [1200, 'Far'],
                            [3000, 'Max'],
                        ] as const
                    ).map(([z, label]) => (
                        <button
                            key={z}
                            onClick={() => handleZoom(z)}
                            className="cursor-pointer rounded-md border border-slate-700/50 bg-slate-900/80 px-2.5 py-1 font-mono text-[9px] text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-300"
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    {lobes.map((lobe: Lobe) => (
                        <div key={lobe.community} className="flex items-center gap-1.5">
                            <div
                                className="size-[5px] rounded-full"
                                style={{
                                    background: lobe.color,
                                    boxShadow: `0 0 3px ${lobe.color}`,
                                }}
                            />
                            <span className="text-[8px] text-slate-500">
                                {lobe.name.split(' ')[0]}
                            </span>
                        </div>
                    ))}
                </div>

                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-700/50 bg-slate-900/80 px-3 py-1 font-mono text-[10px] font-bold text-slate-300 transition-colors hover:border-slate-600"
                >
                    {isPlaying ? (
                        <>
                            <svg
                                width={10}
                                height={10}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                            </svg>
                            PAUSE
                        </>
                    ) : (
                        <>
                            <svg
                                width={10}
                                height={10}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path d="M5 3l14 9-14 9V3z" />
                            </svg>
                            PLAY
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
