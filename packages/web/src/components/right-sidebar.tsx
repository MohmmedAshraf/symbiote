import { useBrain } from '@/lib/brain-context';
import { useEvents } from '@/lib/events-context';

export function RightSidebar() {
    const { brainState, lobes, isReady } = useBrain();
    const { eventCount } = useEvents();

    return (
        <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-950">
            {/* Awareness */}
            <div className="border-b border-slate-800/60 px-4 py-3">
                <div className="mb-2 text-[9px] font-semibold tracking-[1.5px] text-slate-500">
                    AWARENESS
                </div>
                {isReady ? (
                    <>
                        <div className="mb-2 flex items-baseline gap-1">
                            <span className="text-2xl font-black leading-none text-purple-400">
                                {(brainState.consciousness * 100).toFixed(1)}
                            </span>
                            <span className="text-[10px] text-slate-500">%</span>
                        </div>
                        <div className="mb-2 h-1 overflow-hidden rounded-full bg-slate-800">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${brainState.consciousness * 100}%`,
                                    background: 'linear-gradient(90deg, #7c3aed, #c084fc)',
                                }}
                            />
                        </div>
                        <div className="text-[9px] text-slate-500">
                            {brainState.activeSignal ?? 'Awaiting input...'}
                        </div>
                    </>
                ) : (
                    <div className="text-[11px] text-slate-600">Visit BRAIN to activate</div>
                )}
            </div>

            {/* Active Signal */}
            {brainState.activeSignal && (
                <div className="border-b border-slate-800/60 px-4 py-3">
                    <div className="mb-2 text-[9px] font-semibold tracking-[1.5px] text-slate-500">
                        ACTIVE SIGNAL
                    </div>
                    <div className="mb-1 text-[8px] text-slate-600">ROUTING TO</div>
                    <div className="mb-2 text-[12px] font-bold text-blue-400">
                        {brainState.activeLobe}
                    </div>
                    <div className="h-[3px] overflow-hidden rounded-full bg-slate-800">
                        <div
                            className="h-full rounded-full bg-blue-400 transition-all duration-100"
                            style={{ width: `${brainState.signalProgress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Lobe Activity */}
            {lobes.length > 0 && (
                <div className="border-b border-slate-800/60 px-4 py-3">
                    <div className="mb-3 text-[9px] font-semibold tracking-[1.5px] text-slate-500">
                        LOBE ACTIVITY
                    </div>
                    {lobes.map((lobe, idx) => (
                        <div key={lobe.community} className="mb-3 last:mb-0">
                            <div className="mb-1 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div
                                        className="size-[5px] rounded-full"
                                        style={{
                                            background: lobe.color,
                                            boxShadow: `0 0 4px ${lobe.color}60`,
                                        }}
                                    />
                                    <span className="text-[10px] text-slate-400">{lobe.name}</span>
                                </div>
                                <span
                                    className="text-[10px] font-bold"
                                    style={{ color: lobe.color }}
                                >
                                    {Math.round((brainState.lobeActivity[idx] ?? 0) * 100)}%
                                </span>
                            </div>
                            <div className="h-[3px] overflow-hidden rounded-full bg-slate-800">
                                <div
                                    className="h-full rounded-full transition-all duration-200"
                                    style={{
                                        width: `${(brainState.lobeActivity[idx] ?? 0) * 100}%`,
                                        background: lobe.color,
                                    }}
                                />
                            </div>
                            <div className="mt-1 text-[8px] text-slate-600">
                                {lobe.nodeCount} nodes
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Neural Metrics */}
            <div className="px-4 py-3">
                <div className="mb-3 text-[9px] font-semibold tracking-[1.5px] text-slate-500">
                    NEURAL METRICS
                </div>
                {(
                    [
                        ['Pulse', brainState.velocity, '#facc15', 120],
                        ['Events', eventCount, '#22d3ee', 200],
                        ['Signals', brainState.signalProgress, '#c084fc', 100],
                    ] as const
                ).map(([label, val, color, max]) => (
                    <div key={label} className="mb-3 last:mb-0">
                        <div className="mb-1 flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">{label}</span>
                            <span className="text-[11px] font-bold" style={{ color }}>
                                {val}
                            </span>
                        </div>
                        <div className="h-[3px] overflow-hidden rounded-full bg-slate-800">
                            <div
                                className="h-full rounded-full"
                                style={{
                                    width: `${Math.min(100, (val / max) * 100)}%`,
                                    background: color,
                                    opacity: 0.75,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    );
}
