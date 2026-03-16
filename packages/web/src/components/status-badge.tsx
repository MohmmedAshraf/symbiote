import type { ReactNode } from 'react';

type Variant = 'error' | 'warning' | 'info' | 'success' | 'neutral';

const variants: Record<Variant, string> = {
    error: 'bg-danger/15 text-danger',
    warning: 'bg-warning/15 text-warning',
    info: 'bg-accent/15 text-accent',
    success: 'bg-success/15 text-success',
    neutral: 'bg-surface-2 text-text-secondary',
};

interface StatusBadgeProps {
    variant: Variant;
    children: ReactNode;
}

export function StatusBadge({ variant, children }: StatusBadgeProps) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variants[variant]}`}
        >
            {children}
        </span>
    );
}
