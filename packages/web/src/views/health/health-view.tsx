import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { HealthReport, HealthCategory, HealthIssue } from '@/lib/types';

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
        <div className="h-full w-full overflow-y-auto bg-slate-950 px-8 py-8 animate-fade-in">
            {loading && (
                <div className="flex h-full items-center justify-center">
                    <div className="text-xs text-slate-500">Analyzing health...</div>
                </div>
            )}

            {error && (
                <div className="flex h-full items-center justify-center">
                    <div className="text-xs text-red-400">Failed to load: {error}</div>
                </div>
            )}

            {report && <HealthDashboard report={report} />}
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

    const strokeColor = report.score >= 80 ? '#34d399' : report.score >= 50 ? '#facc15' : '#f87171';
    const scoreTextClass =
        report.score >= 80
            ? 'text-emerald-400'
            : report.score >= 50
              ? 'text-yellow-400'
              : 'text-red-400';

    return (
        <div className="mx-auto max-w-3xl animate-slide-up">
            <div className="mb-10 flex items-center gap-10">
                <ScoreRing score={report.score} color={strokeColor} textClass={scoreTextClass} />

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
                <div className="mb-3 text-[9px] font-semibold uppercase tracking-[1.5px] text-slate-500">
                    All Issues ({allIssues.length})
                </div>

                {allIssues.length === 0 ? (
                    <div className="py-10 text-center text-[11px] text-slate-500">
                        No issues found.
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-800">
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
    textClass,
}: {
    score: number;
    color: string;
    textClass: string;
}) {
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="relative size-36 shrink-0">
            <svg className="size-full -rotate-90" viewBox="0 0 120 120">
                <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="7"
                />
                <circle
                    cx="60"
                    cy="60"
                    r="54"
                    fill="none"
                    stroke={color}
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className="transition-all duration-700"
                    style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-[32px] font-black tabular-nums leading-none ${textClass}`}>
                    {score}
                </span>
                <span className="mt-1 text-[9px] font-semibold tracking-[1.5px] text-slate-500">
                    HEALTH
                </span>
            </div>
        </div>
    );
}

function CategoryCard({ title, category }: { title: string; category: HealthCategory }) {
    const color = category.score >= 80 ? '#34d399' : category.score >= 50 ? '#facc15' : '#f87171';

    return (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-[1px] text-slate-500">
                    {title}
                </span>
                <span className="text-lg font-black tabular-nums" style={{ color }}>
                    {category.score}
                </span>
            </div>
            <div className="mb-1.5 h-[3px] overflow-hidden rounded-full bg-slate-800">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${category.score}%`, background: color }}
                />
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-500">
                <span>{Math.round(category.weight * 100)}% weight</span>
                <span>
                    {category.issues.length} issue{category.issues.length !== 1 ? 's' : ''}
                </span>
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
    const color = colors[issue.severity] ?? '#64748b';

    return (
        <div className="flex items-center gap-3 border-b border-slate-800/60 bg-slate-900/60 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-slate-900">
            <span
                className="shrink-0 rounded-md px-2 py-0.5 text-[8px] font-bold uppercase"
                style={{ color, background: `${color}15` }}
            >
                {issue.severity}
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[11px] text-slate-200">{issue.message}</div>
                <div className="mt-0.5 truncate text-[9px] text-slate-500">
                    {issue.filePath}
                    {issue.line != null && `:${issue.line}`}
                </div>
            </div>
            <span className="shrink-0 text-[8px] font-medium text-slate-600">{issue.category}</span>
        </div>
    );
}
