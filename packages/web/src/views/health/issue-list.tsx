import type { HealthIssue } from '@/lib/types';
import { StatusBadge } from '@/components/status-badge';

interface IssueListProps {
    issues: HealthIssue[];
}

const severityVariant = {
    error: 'error',
    warning: 'warning',
    info: 'info',
} as const;

export function IssueList({ issues }: IssueListProps) {
    if (issues.length === 0) {
        return (
            <p className="py-8 text-center text-sm text-text-muted">
                No issues found.
            </p>
        );
    }

    return (
        <div className="divide-y divide-border-subtle">
            {issues.map((issue, i) => (
                <div
                    key={i}
                    className="flex items-start gap-3 px-4 py-3"
                >
                    <StatusBadge
                        variant={severityVariant[issue.severity]}
                    >
                        {issue.severity}
                    </StatusBadge>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm text-text-primary">
                            {issue.message}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-text-muted">
                            {issue.filePath}
                            {issue.line != null &&
                                `:${issue.line}`}
                        </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-text-muted">
                        {issue.category}
                    </span>
                </div>
            ))}
        </div>
    );
}
