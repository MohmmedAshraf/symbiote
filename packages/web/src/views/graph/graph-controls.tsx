export function GraphControls() {
    return (
        <div className="absolute bottom-4 left-4 flex gap-2">
            <div className="flex items-center gap-4 rounded-lg bg-surface-1/90 px-3 py-2 text-xs text-text-secondary backdrop-blur-sm">
                <LegendDot color="bg-node-file" label="File" />
                <LegendDot
                    color="bg-node-function"
                    label="Function"
                />
                <LegendDot color="bg-node-class" label="Class" />
                <LegendDot
                    color="bg-node-violation"
                    label="Violation"
                />
            </div>
        </div>
    );
}

function LegendDot({
    color,
    label,
}: {
    color: string;
    label: string;
}) {
    return (
        <span className="flex items-center gap-1.5">
            <span
                className={`inline-block size-2.5 rounded-full ${color}`}
            />
            {label}
        </span>
    );
}
