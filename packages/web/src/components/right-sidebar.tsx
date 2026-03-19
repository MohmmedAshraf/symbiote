import { useBrain } from '@/lib/brain-context';
import { useEvents } from '@/lib/events-context';

const RISK_COLORS: Record<string, string> = {
    LOW: '#4ade80',
    MEDIUM: '#facc15',
    HIGH: '#f87171',
};

export function RightSidebar() {
    const { brainState, lobes, isReady } = useBrain();
    const { brainMetrics } = useEvents();
    const { awareness, pulse, ripples, events } = brainMetrics;

    return (
        <aside className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-950">
            {/* Awareness */}
            <div className="border-b border-slate-800/60 px-4 py-3">
                <div className="mb-2 text-[9px] font-semibold tracking-[1.5px] text-slate-500">
                    AWARENESS
                </div>
                {isReady ? (
                    <>
                        <div className="mb-1 flex items-baseline gap-1">
                            <span className="text-2xl font-black leading-none text-purple-400">
                                {(awareness.value * 100).toFixed(1)}
                            </span>
                            <span className="text-[10px] text-slate-500">%</span>
                        </div>
                        <div className="mb-1 h-1 overflow-hidden rounded-full bg-slate-800">
                            <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{
                                    width: `${awareness.value * 100}%`,
                                    background: 'linear-gradient(90deg, #7c3aed, #c084fc)',
                                }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-500">
                            <span>
                                {awareness.readNodes} / {awareness.totalNodes} nodes
                            </span>
                            {awareness.blindSpots > 0 && (
                                <span className="text-amber-400">
                                    {awareness.blindSpots} blind spots
                                </span>
                            )}
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
                    {lobes.map((lobe) => {
                        const lobeData = brainMetrics.lobes.find(
                            (l) => l.community === lobe.community,
                        );
                        const coverage = lobeData?.readCoverage ?? 0;
                        const edits = lobeData?.editIntensity ?? 0;
                        const isBlind = edits > 0 && coverage < 0.15;

                        return (
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
                                        <span className="text-[10px] text-slate-400">
                                            {lobe.name}
                                        </span>
                                    </div>
                                    <span
                                        className="text-[10px] font-bold"
                                        style={{ color: lobe.color }}
                                    >
                                        {Math.round(coverage * 100)}%
                                    </span>
                                </div>
                                <div className="flex gap-1">
                                    <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-slate-800">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{
                                                width: `${coverage * 100}%`,
                                                background: lobe.color,
                                                opacity: 0.6,
                                            }}
                                        />
                                    </div>
                                    {edits > 0 && (
                                        <div className="h-[3px] w-8 overflow-hidden rounded-full bg-slate-800">
                                            <div
                                                className="h-full rounded-full transition-all duration-700"
                                                style={{
                                                    width: `${edits * 100}%`,
                                                    background: '#f87171',
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[8px] text-slate-600">
                                    <span>{lobe.nodeCount} nodes</span>
                                    {isBlind && <span className="text-amber-400">blind spot</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Session Metrics */}
            <div className="border-b border-slate-800/60 px-4 py-3">
                <div className="mb-3 text-[9px] font-semibold tracking-[1.5px] text-slate-500">
                    SESSION ACTIVITY
                </div>
                {(
                    [
                        ['Reads', events.reads, '#22d3ee'],
                        ['Edits', events.edits, '#f87171'],
                        ['Creates', events.creates, '#4ade80'],
                        ['Discoveries', events.discoveries, '#c084fc'],
                    ] as const
                ).map(([label, val, color]) => (
                    <div key={label} className="mb-2 flex items-center justify-between last:mb-0">
                        <span className="text-[10px] text-slate-400">{label}</span>
                        <span className="text-[11px] font-bold" style={{ color }}>
                            {val}
                        </span>
                    </div>
                ))}
            </div>

            {/* Risk & Impact */}
            <div className="px-4 py-3">
                <div className="mb-3 text-[9px] font-semibold tracking-[1.5px] text-slate-500">
                    RISK & IMPACT
                </div>
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Risk Level</span>
                    <span
                        className="text-[11px] font-bold"
                        style={{ color: RISK_COLORS[pulse.riskLevel] }}
                    >
                        {pulse.riskLevel}
                    </span>
                </div>
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Ripple Reach</span>
                    <span className="text-[11px] font-bold text-amber-300">
                        {ripples.totalAffected}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Critical Paths</span>
                    <span
                        className="text-[11px] font-bold"
                        style={{
                            color: ripples.criticalPaths > 0 ? '#f87171' : '#4ade80',
                        }}
                    >
                        {ripples.criticalPaths}
                    </span>
                </div>
            </div>
        </aside>
    );
}
