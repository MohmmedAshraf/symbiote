import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { HealthReport, HealthCategory, HealthIssue } from '@/lib/types';

const PAGE_SIZE = 25;

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
    const strokeColor = report.score >= 80 ? '#34d399' : report.score >= 50 ? '#facc15' : '#f87171';
    const scoreTextClass =
        report.score >= 80
            ? 'text-emerald-400'
            : report.score >= 50
              ? 'text-yellow-400'
              : 'text-red-400';

    const categories: { key: string; title: string; category: HealthCategory; severity: string }[] =
        [
            {
                key: 'constraints',
                title: 'Constraint Violations',
                category: report.categories.constraintViolations,
                severity: 'error',
            },
            {
                key: 'circular',
                title: 'Circular Dependencies',
                category: report.categories.circularDeps,
                severity: 'warning',
            },
            {
                key: 'deadcode',
                title: 'Dead Code',
                category: report.categories.deadCode,
                severity: 'info',
            },
            {
                key: 'coupling',
                title: 'Coupling Hotspots',
                category: report.categories.coupling,
                severity: 'warning',
            },
        ];

    const totalIssues = categories.reduce((sum, c) => sum + c.category.issues.length, 0);

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
                    All Issues ({totalIssues})
                </div>

                {totalIssues === 0 ? (
                    <div className="py-10 text-center text-[11px] text-slate-500">
                        No issues found.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {categories
                            .filter((c) => c.category.issues.length > 0)
                            .map((c) => (
                                <CategorySection
                                    key={c.key}
                                    title={c.title}
                                    issues={c.category.issues}
                                    score={c.category.score}
                                />
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function CategorySection({
    title,
    issues,
    score,
}: {
    title: string;
    issues: HealthIssue[];
    score: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const color = score >= 80 ? '#34d399' : score >= 50 ? '#facc15' : '#f87171';

    const grouped = groupByFile(issues);
    const visibleGroups = expanded ? grouped : [];
    const hasMore = expanded && visibleCount < issues.length;

    return (
        <div className="overflow-hidden rounded-lg border border-slate-800">
            <button
                type="button"
                onClick={() => {
                    setExpanded(!expanded);
                    setVisibleCount(PAGE_SIZE);
                }}
                className="flex w-full items-center gap-3 bg-slate-900/80 px-4 py-3 text-left transition-colors hover:bg-slate-900"
            >
                <span className="text-[10px]" style={{ color }}>
                    {expanded ? '▼' : '▶'}
                </span>
                <span className="text-[11px] font-semibold text-slate-300">{title}</span>
                <span className="text-[10px] tabular-nums text-slate-500">
                    {issues.length} issue{issues.length !== 1 ? 's' : ''}
                </span>
                <span className="ml-auto text-[10px] font-bold tabular-nums" style={{ color }}>
                    {score}
                </span>
            </button>

            {expanded && (
                <div className="divide-y divide-slate-800/40">
                    {visibleGroups.map((group) => (
                        <FileGroup
                            key={group.filePath}
                            filePath={group.filePath}
                            issues={group.issues}
                            visibleLimit={visibleCount}
                        />
                    ))}

                    {hasMore && (
                        <button
                            type="button"
                            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                            className="w-full px-4 py-2 text-center text-[10px] text-slate-500 transition-colors hover:bg-slate-900/50 hover:text-slate-400"
                        >
                            Show more ({issues.length - visibleCount} remaining)
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

interface FileGroupData {
    filePath: string;
    issues: HealthIssue[];
}

function groupByFile(issues: HealthIssue[]): FileGroupData[] {
    const map = new Map<string, HealthIssue[]>();
    for (const issue of issues) {
        const key = issue.filePath || '(unknown)';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(issue);
    }
    return [...map.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([filePath, items]) => ({ filePath, issues: items }));
}

function FileGroup({
    filePath,
    issues,
    visibleLimit,
}: {
    filePath: string;
    issues: HealthIssue[];
    visibleLimit: number;
}) {
    const [expanded, setExpanded] = useState(false);
    const shown = expanded ? issues : issues.slice(0, Math.min(3, visibleLimit));
    const hasMore = issues.length > shown.length;

    return (
        <div className="bg-slate-900/40">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-900/60"
            >
                <span className="text-[9px] text-slate-600">{expanded ? '▾' : '▸'}</span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-slate-400">
                    {filePath}
                </span>
                <span className="shrink-0 text-[9px] tabular-nums text-slate-600">
                    {issues.length}
                </span>
            </button>

            {(expanded || issues.length <= 3) && (
                <div>
                    {shown.map((issue) => (
                        <IssueRow
                            key={`${issue.filePath ?? issue.category}-${issue.message}`}
                            issue={issue}
                        />
                    ))}
                    {hasMore && (
                        <button
                            type="button"
                            onClick={() => setExpanded(true)}
                            className="w-full px-8 py-1.5 text-left text-[9px] text-slate-600 hover:text-slate-400"
                        >
                            +{issues.length - shown.length} more in this file
                        </button>
                    )}
                </div>
            )}
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
        <div className="flex items-center gap-3 border-b border-slate-800/30 bg-slate-900/30 px-6 py-1.5 transition-colors last:border-b-0 hover:bg-slate-900/60">
            <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[7px] font-bold uppercase"
                style={{ color, background: `${color}15` }}
            >
                {issue.severity}
            </span>
            <div className="min-w-0 flex-1">
                <span className="text-[10px] text-slate-300">{issue.message}</span>
                {issue.line != null && (
                    <span className="ml-1.5 text-[9px] text-slate-600">:{issue.line}</span>
                )}
            </div>
        </div>
    );
}
