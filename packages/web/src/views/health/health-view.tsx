import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { HealthReport } from '@/lib/types';
import { HealthScore } from './health-score';
import { CategoryCard } from './category-card';
import { IssueList } from './issue-list';

export function HealthView() {
    const [report, setReport] = useState<HealthReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.health
            .getReport()
            .then(setReport)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-sm text-text-muted">
                    Analyzing health...
                </div>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-sm text-danger">
                    Failed to load health report: {error}
                </div>
            </div>
        );
    }

    const allIssues = [
        ...report.categories.constraintViolations.issues,
        ...report.categories.circularDeps.issues,
        ...report.categories.deadCode.issues,
        ...report.categories.coupling.issues,
    ];

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-8">
                <div className="flex items-start gap-8">
                    <HealthScore score={report.score} />

                    <div className="flex-1 space-y-3">
                        <CategoryCard
                            title="Constraint Violations"
                            category={
                                report.categories
                                    .constraintViolations
                            }
                        />
                        <CategoryCard
                            title="Circular Dependencies"
                            category={
                                report.categories.circularDeps
                            }
                        />
                        <CategoryCard
                            title="Dead Code"
                            category={
                                report.categories.deadCode
                            }
                        />
                        <CategoryCard
                            title="Coupling Hotspots"
                            category={
                                report.categories.coupling
                            }
                        />
                    </div>
                </div>

                <div className="mt-8">
                    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                        All Issues ({allIssues.length})
                    </h2>
                    <div className="rounded-lg border border-border-subtle bg-surface-1">
                        <IssueList issues={allIssues} />
                    </div>
                </div>
            </div>
        </div>
    );
}
