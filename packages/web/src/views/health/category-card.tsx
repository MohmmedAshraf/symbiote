import type { HealthCategory } from '@/lib/types';

interface CategoryCardProps {
    title: string;
    category: HealthCategory;
}

export function CategoryCard({
    title,
    category,
}: CategoryCardProps) {
    const scoreColor =
        category.score >= 80
            ? 'text-success'
            : category.score >= 50
              ? 'text-warning'
              : 'text-danger';

    return (
        <div className="rounded-lg border border-border-subtle bg-surface-1 p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                    {title}
                </h3>
                <div className="flex items-baseline gap-1">
                    <span
                        className={`text-lg font-bold tabular-nums ${scoreColor}`}
                    >
                        {category.score}
                    </span>
                    <span className="text-xs text-text-muted">
                        / 100
                    </span>
                </div>
            </div>

            <div className="mt-1 text-xs text-text-muted">
                Weight: {Math.round(category.weight * 100)}%
                {' \u00b7 '}
                {category.issues.length} issue
                {category.issues.length !== 1 && 's'}
            </div>
        </div>
    );
}
