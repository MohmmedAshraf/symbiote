export function GraphControls() {
    return (
        <div className="absolute bottom-4 left-4 flex gap-2">
            <div className="flex items-center gap-4 rounded-lg bg-surface-1/90 px-3 py-2 text-xs text-text-secondary backdrop-blur-sm">
                <LegendItem type="pulse" label="Neuron" />
                <LegendItem type="line" label="Synapse" />
                <LegendItem type="dot" label="Impulse" />
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-surface-1/90 px-3 py-2 text-xs text-text-muted backdrop-blur-sm">
                <span>Scroll: zoom</span>
                <span>Drag: orbit</span>
                <span>Click: inspect</span>
            </div>
        </div>
    );
}

function LegendItem({ type, label }: { type: 'pulse' | 'line' | 'dot'; label: string }) {
    return (
        <span className="flex items-center gap-1.5">
            {type === 'pulse' && (
                <span className="inline-block size-2.5 animate-pulse rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.6)]" />
            )}
            {type === 'line' && (
                <span className="inline-block h-px w-4 bg-gradient-to-r from-blue-400/60 to-transparent" />
            )}
            {type === 'dot' && (
                <span className="inline-block size-1.5 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]" />
            )}
            {label}
        </span>
    );
}
