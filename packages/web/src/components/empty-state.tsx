import type { ReactNode } from 'react';

interface EmptyStateProps {
    icon: ReactNode;
    title: string;
    description: string;
}

export function EmptyState({
    icon,
    title,
    description,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <div className="text-text-muted">{icon}</div>
            <h3 className="text-sm font-medium text-text-primary">
                {title}
            </h3>
            <p className="max-w-sm text-sm text-text-secondary">
                {description}
            </p>
        </div>
    );
}
