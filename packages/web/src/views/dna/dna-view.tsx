import { useState, useEffect, useCallback, useMemo, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { DnaEntry } from '@/lib/types';
import { ViewHeader } from '@/components/view-header';

type Filter = 'all' | 'suggested' | 'approved' | 'rejected';

const CATEGORY_ICONS: Record<string, string> = {
    style: '\u2728',
    preferences: '\u2699',
    'anti-patterns': '\u26A0',
    decisions: '\u2696',
};

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
        async (id: string, content: string) => {
            await api.dna.update(id, { content });
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
        <div className="flex h-full w-full flex-col bg-surface-0 text-text-primary">
            <ViewHeader title="DNA LAB" />

            <div className="flex-1 overflow-y-auto px-8 py-6 animate-fade-in">
                <div className="mx-auto max-w-2xl">
                    <div className="mb-6 animate-slide-up">
                        <h1 className="text-base font-bold text-text-primary">Developer DNA</h1>
                        <p className="mt-1 text-xs text-text-secondary">
                            Your coding identity — learned from corrections and instructions.
                        </p>
                    </div>

                    {loading ? (
                        <div className="py-20 text-center text-xs text-text-muted">
                            Loading DNA...
                        </div>
                    ) : error ? (
                        <div className="py-20 text-center text-xs text-danger">
                            Failed to load: {error}
                        </div>
                    ) : (
                        <div className="animate-slide-up">
                            <FilterBar filter={filter} counts={counts} onChange={setFilter} />

                            {filtered.length === 0 ? (
                                <EmptyDna filter={filter} />
                            ) : (
                                <div className="mt-3 space-y-2">
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
        </div>
    );
}

function EmptyDna({ filter }: { filter: Filter }) {
    return (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
            <svg
                className="size-10 text-text-muted/30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
            >
                <path d="M2 15c6.667-6 13.333 0 20-6" />
                <path d="M2 9c6.667 6 13.333 0 20 6" />
            </svg>
            <div className="text-xs text-text-muted">
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
        <div className="flex gap-1 rounded-lg border border-border-subtle bg-surface-1 p-1">
            {filters.map((f) => (
                <button
                    key={f}
                    onClick={() => onChange(f)}
                    className={`rounded-md px-3 py-1 text-[10px] font-medium transition-all duration-150
                        ${
                            filter === f
                                ? 'bg-surface-3 text-text-primary'
                                : 'text-text-muted hover:bg-surface-2 hover:text-text-secondary'
                        }`}
                >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                    <span className="ml-1 tabular-nums opacity-60">{counts[f]}</span>
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
    onUpdate: (id: string, content: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editContent, setEditContent] = useState(entry.content);

    const statusStyle: Record<string, string> = {
        suggested: 'border-warning/30 bg-warning/5 text-warning',
        approved: 'border-emerald/30 bg-emerald/5 text-emerald',
        rejected: 'border-danger/30 bg-danger/5 text-danger',
    };

    const categoryIcon = CATEGORY_ICONS[entry.category] ?? '\u25CB';

    function handleSave(e: FormEvent) {
        e.preventDefault();
        const trimmed = editContent.trim();
        if (trimmed) {
            onUpdate(entry.id, trimmed);
            setEditing(false);
        }
    }

    return (
        <div className="group rounded-lg border border-border-subtle bg-surface-1 p-4 transition-colors hover:border-border">
            <div className="mb-3 flex items-center gap-2">
                <span
                    className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${statusStyle[entry.status] ?? 'text-text-muted'}`}
                >
                    {entry.status}
                </span>
                <span className="text-[10px] text-text-muted">
                    {categoryIcon} {entry.category}
                </span>
                <span className="ml-auto text-[9px] tabular-nums text-text-muted">
                    {Math.round(entry.confidence * 100)}%
                </span>
            </div>

            {editing ? (
                <form onSubmit={handleSave}>
                    <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={3}
                        className="w-full resize-y rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
                    />
                    <div className="mt-2 flex gap-2">
                        <button
                            type="submit"
                            className="rounded-md bg-accent/10 px-3 py-1 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/20"
                        >
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="rounded-md px-3 py-1 text-[10px] font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <p className="text-[13px] leading-relaxed text-text-primary/90">{entry.content}</p>
            )}

            <div className="mt-3 flex items-center gap-3 text-[9px] text-text-muted">
                <span>
                    Seen{' '}
                    <span className="tabular-nums text-text-secondary">{entry.occurrences}x</span>
                </span>
                <span className="text-border">\u2022</span>
                <span>Source: {entry.source}</span>
                <span className="text-border">\u2022</span>
                <span>Last: {entry.lastSeen}</span>
            </div>

            {!editing && (
                <div className="mt-3 flex gap-1.5 border-t border-border-subtle pt-3 opacity-0 transition-opacity group-hover:opacity-100">
                    {entry.status === 'suggested' && (
                        <>
                            <button
                                onClick={() => onAction(entry.id, 'approve')}
                                className="rounded-md bg-emerald/10 px-2.5 py-1 text-[10px] font-semibold text-emerald transition-colors hover:bg-emerald/20"
                            >
                                Approve
                            </button>
                            <button
                                onClick={() => onAction(entry.id, 'reject')}
                                className="rounded-md bg-danger/10 px-2.5 py-1 text-[10px] font-semibold text-danger transition-colors hover:bg-danger/20"
                            >
                                Reject
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => {
                            setEditContent(entry.content);
                            setEditing(true);
                        }}
                        className="rounded-md px-2.5 py-1 text-[10px] font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary"
                    >
                        Edit
                    </button>
                </div>
            )}
        </div>
    );
}
