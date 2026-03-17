import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { DnaEntry } from '@/lib/types';
import { DnaEntryCard } from './dna-entry-card';
import { EmptyState } from '@/components/empty-state';

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

    async function handleApprove(id: string) {
        try {
            await api.dna.update(id, { status: 'approved' });
            fetchEntries();
        } catch (e) {
            console.error('Failed to approve DNA entry:', e);
            setError(e instanceof Error ? e.message : 'Failed to approve entry');
        }
    }

    async function handleReject(id: string) {
        try {
            await api.dna.update(id, { status: 'rejected' });
            fetchEntries();
        } catch (e) {
            console.error('Failed to reject DNA entry:', e);
            setError(e instanceof Error ? e.message : 'Failed to reject entry');
        }
    }

    async function handleUpdate(id: string, content: string) {
        try {
            await api.dna.update(id, { content });
            fetchEntries();
        } catch (e) {
            console.error('Failed to update DNA entry:', e);
            setError(e instanceof Error ? e.message : 'Failed to update entry');
        }
    }

    const filtered = filter === 'all' ? entries : entries.filter((e) => e.status === filter);

    const counts = {
        all: entries.length,
        suggested: entries.filter((e) => e.status === 'suggested').length,
        approved: entries.filter((e) => e.status === 'approved').length,
        rejected: entries.filter((e) => e.status === 'rejected').length,
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-sm text-text-muted">Loading DNA...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-sm text-danger">Failed to load DNA: {error}</div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-2xl px-6 py-8">
                <h1 className="text-lg font-semibold text-text-primary">DNA Lab</h1>
                <p className="mt-1 text-sm text-text-secondary">
                    Your coding identity — learned from corrections and instructions.
                </p>

                <div className="mt-6 flex gap-1 rounded-lg bg-surface-1 p-1">
                    {(['all', 'suggested', 'approved', 'rejected'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                filter === f
                                    ? 'bg-surface-2 text-text-primary'
                                    : 'text-text-muted hover:text-text-secondary'
                            }`}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
                        </button>
                    ))}
                </div>

                <div className="mt-4 space-y-3">
                    {filtered.length === 0 ? (
                        <EmptyState
                            icon={<DnaPlaceholderIcon />}
                            title={filter === 'all' ? 'No DNA entries yet' : `No ${filter} entries`}
                            description={
                                filter === 'all'
                                    ? 'Start coding with an AI tool connected to Symbiote. Your style preferences will appear here.'
                                    : `No entries with status "${filter}".`
                            }
                        />
                    ) : (
                        filtered.map((entry) => (
                            <DnaEntryCard
                                key={entry.id}
                                entry={entry}
                                onApprove={handleApprove}
                                onReject={handleReject}
                                onUpdate={handleUpdate}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function DnaPlaceholderIcon() {
    return (
        <svg
            className="size-10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
        >
            <path d="M2 15c6.667-6 13.333 0 20-6" />
            <path d="M2 9c6.667 6 13.333 0 20 6" />
        </svg>
    );
}
