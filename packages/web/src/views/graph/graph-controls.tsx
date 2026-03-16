interface GraphControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetView: () => void;
}

export function GraphControls({ onZoomIn, onZoomOut, onResetView }: GraphControlsProps) {
    return (
        <div className="absolute right-4 top-4 flex flex-col gap-1.5">
            <ControlButton label="+" onClick={onZoomIn} title="Zoom in" />
            <ControlButton label="-" onClick={onZoomOut} title="Zoom out" />
            <ControlButton label="0" onClick={onResetView} title="Reset view" />
        </div>
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
