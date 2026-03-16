interface GraphControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetView: () => void;
    nodeCount?: number;
    edgeCount?: number;
}

export function GraphControls({
    onZoomIn,
    onZoomOut,
    onResetView,
    nodeCount,
    edgeCount,
}: GraphControlsProps) {
    return (
        <>
            <div className="absolute right-4 top-4 flex flex-col gap-1.5">
                <ControlButton label="+" onClick={onZoomIn} title="Zoom in" />
                <ControlButton label="-" onClick={onZoomOut} title="Zoom out" />
                <ControlButton label="0" onClick={onResetView} title="Reset view" />
            </div>

            <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-lg bg-surface-1/80 px-3 py-2 text-xs text-text-muted backdrop-blur-sm">
                {nodeCount !== undefined && (
                    <span>
                        <span className="text-text-secondary">{nodeCount}</span> nodes
                    </span>
                )}
                {edgeCount !== undefined && (
                    <span>
                        <span className="text-text-secondary">{edgeCount}</span> edges
                    </span>
                )}
                <span className="text-text-muted/50">|</span>
                <span>Scroll: zoom</span>
                <span>Drag: orbit</span>
                <span>Click: inspect</span>
            </div>
        </>
    );
}

function ControlButton({
    label,
    onClick,
    title,
}: {
    label: string;
    onClick: () => void;
    title: string;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            className="flex size-8 items-center justify-center rounded-md bg-surface-1/80 text-sm text-text-secondary backdrop-blur-sm transition-colors hover:bg-surface-1 hover:text-text-primary"
        >
            {label}
        </button>
    );
}
