import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { DnaEntry } from '@/lib/types';

type Filter = 'all' | 'suggested' | 'approved' | 'rejected';

export function DnaView() {
    const [entries, setEntries] = useState<DnaEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('all');

    const fetchEntries = useCallback(() => {
        setLoading(true);
        api.dna
            .list()
            .then(setEntries)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const handleAction = useCallback(
        async (id: string, action: 'approve' | 'reject') => {
            await api.dna.update(id, {
                status: action === 'approve' ? 'approved' : 'rejected',
            });
            fetchEntries();
        },
        [fetchEntries],
    );

    const handleUpdate = useCallback(
        async (id: string, rule: string, reason: string) => {
            await api.dna.update(id, { rule, reason });
            fetchEntries();
        },
        [fetchEntries],
    );

    const filtered = filter === 'all' ? entries : entries.filter((e) => e.status === filter);

    const counts = useMemo(() => {
        const r = { all: entries.length, suggested: 0, approved: 0, rejected: 0 };
        for (const e of entries) {
            if (e.status in r) r[e.status as keyof typeof r]++;
        }
        return r;
    }, [entries]);

    return (
        <div className="h-full w-full overflow-y-auto bg-slate-950 px-8 py-8 animate-fade-in">
            <div className="mx-auto max-w-2xl">
                <div className="mb-8 animate-slide-up">
                    <h1 className="text-base font-bold text-slate-100">Developer DNA</h1>
                    <p className="mt-1.5 text-xs text-slate-400">
                        Your coding identity — learned from corrections and instructions.
                    </p>
                </div>

                {loading ? (
                    <div className="py-20 text-center text-xs text-slate-500">Loading DNA...</div>
                ) : error ? (
                    <div className="py-20 text-center text-xs text-red-400">
                        Failed to load: {error}
                    </div>
                ) : (
                    <div className="animate-slide-up">
                        <FilterBar filter={filter} counts={counts} onChange={setFilter} />

                        {filtered.length === 0 ? (
                            <EmptyDna filter={filter} />
                        ) : (
                            <div className="mt-4 space-y-2.5">
                                {filtered.map((entry) => (
                                    <EntryCard
                                        key={entry.id}
                                        entry={entry}
                                        onAction={handleAction}
                                        onUpdate={handleUpdate}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function EmptyDna({ filter }: { filter: Filter }) {
    return (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
            <svg
                className="size-10 text-slate-700"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
            >
                <path d="M2 15c6.667-6 13.333 0 20-6" />
                <path d="M2 9c6.667 6 13.333 0 20 6" />
            </svg>
            <div className="text-xs text-slate-500">
                {filter === 'all'
                    ? 'No DNA entries yet. Start coding with Symbiote connected.'
                    : `No ${filter} entries.`}
            </div>
        </div>
    );
}

function FilterBar({
    filter,
    counts,
    onChange,
}: {
    filter: Filter;
    counts: Record<Filter, number>;
    onChange: (f: Filter) => void;
}) {
    const filters: Filter[] = ['all', 'suggested', 'approved', 'rejected'];

    return (
        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
            {filters.map((f) => (
                <button
                    key={f}
                    onClick={() => onChange(f)}
                    className={`cursor-pointer rounded-md px-3 py-1.5 text-[10px] font-semibold transition-all duration-150
                        ${
                            filter === f
                                ? 'bg-slate-700 text-slate-100'
                                : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                        }`}
                >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                    <span className="ml-1.5 tabular-nums opacity-50">{counts[f]}</span>
                </button>
            ))}
        </div>
    );
}

function EntryCard({
    entry,
    onAction,
    onUpdate,
}: {
    entry: DnaEntry;
    onAction: (id: string, action: 'approve' | 'reject') => void;
    onUpdate: (id: string, rule: string, reason: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editRule, setEditRule] = useState(entry.rule);
    const [editReason, setEditReason] = useState(entry.reason);

    const statusStyle: Record<string, string> = {
        suggested: 'border-yellow-500/25 bg-yellow-500/5 text-yellow-400',
        approved: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-400',
        rejected: 'border-red-500/25 bg-red-500/5 text-red-400',
    };

    function handleSave(e: FormEvent) {
        e.preventDefault();
        const trimmedRule = editRule.trim();
        const trimmedReason = editReason.trim();
        if (trimmedRule) {
            onUpdate(entry.id, trimmedRule, trimmedReason);
            setEditing(false);
        }
    }

    return (
        <div className="group rounded-lg border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700">
            <div className="mb-3 flex items-center gap-2.5">
                <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${statusStyle[entry.status] ?? 'text-slate-500'}`}
                >
                    {entry.status}
                </span>
                <span className="text-[10px] text-slate-500">{entry.category}</span>
                <span className="ml-auto text-[9px] font-semibold tabular-nums text-slate-500">
                    {Math.round(entry.confidence * 100)}%
                </span>
            </div>

            {editing ? (
                <form onSubmit={handleSave}>
                    <textarea
                        value={editRule}
                        onChange={(e) => setEditRule(e.target.value)}
                        rows={2}
                        placeholder="Rule"
                        className="w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-blue-500"
                    />
                    <textarea
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        rows={2}
                        placeholder="Reason"
                        className="mt-2 w-full resize-y rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-400 outline-none transition-colors focus:border-blue-500"
                    />
                    <div className="mt-2 flex gap-2">
                        <button
                            type="submit"
                            className="cursor-pointer rounded-md bg-blue-500/10 px-3 py-1 text-[10px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/20"
                        >
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="cursor-pointer rounded-md px-3 py-1 text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <div>
                    <p className="text-[13px] leading-relaxed text-slate-200/90">{entry.rule}</p>
                    {entry.reason && (
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                            {entry.reason}
                        </p>
                    )}
                    {entry.applies_to.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {entry.applies_to.map((lang) => (
                                <span
                                    key={lang}
                                    className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400"
                                >
                                    {lang}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="mt-3 flex items-center gap-3 text-[9px] text-slate-500">
                <span>
                    Seen{' '}
                    <span className="tabular-nums text-slate-400">
                        {entry.evidence.occurrences}x
                    </span>
                </span>
                <span className="text-slate-700">{'\u2022'}</span>
                <span>
                    <span className="tabular-nums text-slate-400">
                        {entry.evidence.sessions}
                    </span>{' '}
                    sessions
                </span>
                <span className="text-slate-700">{'\u2022'}</span>
                <span>Source: {entry.source}</span>
                <span className="text-slate-700">{'\u2022'}</span>
                <span>Last: {entry.evidence.last_seen}</span>
            </div>

            {!editing && (
                <div className="mt-3 flex gap-1.5 border-t border-slate-800 pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                    {entry.status === 'suggested' && (
                        <>
                            <button
                                onClick={() => onAction(entry.id, 'approve')}
                                className="cursor-pointer rounded-md bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20"
                            >
                                Approve
                            </button>
                            <button
                                onClick={() => onAction(entry.id, 'reject')}
                                className="cursor-pointer rounded-md bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-400 transition-colors hover:bg-red-500/20"
                            >
                                Reject
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => {
                            setEditRule(entry.rule);
                            setEditReason(entry.reason);
                            setEditing(true);
                        }}
                        className="cursor-pointer rounded-md px-2.5 py-1 text-[10px] font-medium text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                    >
                        Edit
                    </button>
                </div>
            )}
        </div>
    );
}
