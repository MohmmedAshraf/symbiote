import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { HealthReport, HealthCategory, HealthIssue } from '@/lib/types';
import { ViewHeader } from '@/components/view-header';

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

    return (
        <div className="flex h-full w-full flex-col bg-surface-0 text-text-primary">
            <ViewHeader title="HEALTH PULSE" />

            <div className="flex-1 overflow-y-auto px-8 py-6 animate-fade-in">
                {loading && (
                    <div className="flex h-full items-center justify-center">
                        <div className="text-xs text-text-muted">Analyzing health...</div>
                    </div>
                )}

                {error && (
                    <div className="flex h-full items-center justify-center">
                        <div className="text-xs text-danger">Failed to load: {error}</div>
                    </div>
                )}

                {report && <HealthDashboard report={report} />}
            </div>
        </div>
    );
}

function HealthDashboard({ report }: { report: HealthReport }) {
    const allIssues = [
        ...report.categories.constraintViolations.issues,
        ...report.categories.circularDeps.issues,
        ...report.categories.deadCode.issues,
        ...report.categories.coupling.issues,
    ];

    const scoreColor =
        report.score >= 80 ? 'text-emerald' : report.score >= 50 ? 'text-warning' : 'text-danger';
    const strokeColor = report.score >= 80 ? '#34d399' : report.score >= 50 ? '#facc15' : '#f87171';

    return (
        <div className="mx-auto max-w-3xl animate-slide-up">
            <div className="mb-8 flex items-center gap-8">
                <ScoreRing score={report.score} color={strokeColor} colorClass={scoreColor} />

                <div className="grid flex-1 grid-cols-2 gap-3">
                    <CategoryCard
                        title="Constraints"
                        category={report.categories.constraintViolations}
                    />
                    <CategoryCard title="Circular Deps" category={report.categories.circularDeps} />
                    <CategoryCard title="Dead Code" category={report.categories.deadCode} />
                    <CategoryCard title="Coupling" category={report.categories.coupling} />
                </div>
            </div>

            <div>
                <h2 className="mb-2 text-[9px] font-bold uppercase tracking-[1px] text-text-muted">
                    All Issues ({allIssues.length})
                </h2>

                {allIssues.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-text-muted">
                        No issues found.
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-lg border border-border-subtle">
                        {allIssues.map((issue, i) => (
                            <IssueRow key={i} issue={issue} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function ScoreRing({
    score,
    color,
    colorClass,
}: {
    score: number;
    color: string;
    colorClass: string;
}) {
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="relative size-32 shrink-0">
            <svg className="size-full -rotate-90" viewBox="0 0 120 120">
                <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="8"
                />
                <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-all duration-700"
                    style={{ filter: `drop-shadow(0 0 6px ${color})` }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-[28px] font-black tabular-nums ${colorClass}`}>{score}</span>
                <span className="text-[9px] text-text-muted">HEALTH</span>
            </div>
        </div>
    );
}

function CategoryCard({ title, category }: { title: string; category: HealthCategory }) {
    const color = category.score >= 80 ? '#34d399' : category.score >= 50 ? '#facc15' : '#f87171';

    return (
        <div className="rounded-lg border border-border-subtle bg-surface-1 p-3">
            <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide text-text-secondary">
                    {title}
                </span>
                <span className="text-base font-black tabular-nums" style={{ color }}>
                    {category.score}
                </span>
            </div>
            <div className="mb-1 h-[3px] overflow-hidden rounded-full bg-white/5">
                <div
                    className="h-full rounded-full opacity-80 transition-all duration-500"
                    style={{ width: `${category.score}%`, background: color }}
                />
            </div>
            <div className="text-[8px] text-text-muted">
                {Math.round(category.weight * 100)}% weight
                {' \u00b7 '}
                {category.issues.length} issue{category.issues.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
}

function IssueRow({ issue }: { issue: HealthIssue }) {
    const colors: Record<string, string> = {
        error: '#f87171',
        warning: '#facc15',
        info: '#60a5fa',
    };
    const color = colors[issue.severity] ?? '#475569';

    return (
        <div className="flex items-center gap-2.5 border-b border-border-subtle bg-surface-1/60 px-3 py-2 last:border-b-0">
            <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase"
                style={{ color, background: `${color}1a` }}
            >
                {issue.severity}
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[11px] text-text-primary">{issue.message}</div>
                <div className="truncate text-[9px] text-text-muted">
                    {issue.filePath}
                    {issue.line != null && `:${issue.line}`}
                </div>
            </div>
            <span className="shrink-0 text-[8px] text-text-dim">{issue.category}</span>
        </div>
    );
}
