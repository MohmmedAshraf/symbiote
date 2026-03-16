import type { LayoutNode } from '@/lib/types';

interface NodeLabelProps {
    node: LayoutNode | null;
    position: { x: number; y: number } | null;
}

export function NodeLabel({ node, position }: NodeLabelProps) {
    if (!node || !position) return null;

    return (
        <div
            className="pointer-events-none fixed z-50 rounded-md bg-surface-1/95 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur-sm"
            style={{
                left: position.x + 12,
                top: position.y - 20,
            }}
        >
            <div className="font-medium text-text-primary">{node.name}</div>
            <div className="text-text-muted">{node.type}</div>
        </div>
    );
}
