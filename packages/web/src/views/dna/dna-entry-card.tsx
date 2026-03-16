import { useState } from 'react';
import type { ReactNode } from 'react';
import type { DnaEntry } from '@/lib/types';
import { StatusBadge } from '@/components/status-badge';
import { DnaEditor } from './dna-editor';

interface DnaEntryCardProps {
    entry: DnaEntry;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    onUpdate: (id: string, content: string) => void;
}

const statusVariant = {
    suggested: 'warning',
    approved: 'success',
    rejected: 'error',
} as const;

export function DnaEntryCard({
    entry,
    onApprove,
    onReject,
    onUpdate,
}: DnaEntryCardProps) {
    const [editing, setEditing] = useState(false);

    return (
        <div className="rounded-lg border border-border-subtle bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <StatusBadge
                            variant={
                                statusVariant[entry.status]
                            }
                        >
                            {entry.status}
                        </StatusBadge>
                        <span className="text-xs text-text-muted">
                            {entry.category}
                        </span>
                    </div>

                    {editing ? (
                        <DnaEditor
                            initialContent={entry.content}
                            onSave={(content) => {
                                onUpdate(entry.id, content);
                                setEditing(false);
                            }}
                            onCancel={() => setEditing(false)}
                        />
                    ) : (
                        <p className="mt-2 text-sm leading-relaxed text-text-primary">
                            {entry.content}
                        </p>
                    )}

                    <div className="mt-3 flex items-center gap-4 text-[11px] text-text-muted">
                        <span>
                            Confidence:{' '}
                            <span className="font-medium tabular-nums text-text-secondary">
                                {Math.round(
                                    entry.confidence * 100
                                )}
                                %
                            </span>
                        </span>
                        <span>
                            Seen {entry.occurrences}x
                        </span>
                        <span>Source: {entry.source}</span>
                        <span>Last: {entry.lastSeen}</span>
                    </div>
                </div>
            </div>

            {!editing && (
                <div className="mt-3 flex gap-2 border-t border-border-subtle pt-3">
                    {entry.status === 'suggested' && (
                        <>
                            <ActionButton
                                onClick={() =>
                                    onApprove(entry.id)
                                }
                                variant="success"
                            >
                                Approve
                            </ActionButton>
                            <ActionButton
                                onClick={() =>
                                    onReject(entry.id)
                                }
                                variant="danger"
                            >
                                Reject
                            </ActionButton>
                        </>
                    )}
                    <ActionButton
                        onClick={() => setEditing(true)}
                        variant="neutral"
                    >
                        Edit
                    </ActionButton>
                </div>
            )}
        </div>
    );
}

function ActionButton({
    onClick,
    variant,
    children,
}: {
    onClick: () => void;
    variant: 'success' | 'danger' | 'neutral';
    children: ReactNode;
}) {
    const styles = {
        success: 'text-success hover:bg-success/10',
        danger: 'text-danger hover:bg-danger/10',
        neutral: 'text-text-secondary hover:bg-surface-2',
    };

    return (
        <button
            onClick={onClick}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${styles[variant]}`}
        >
            {children}
        </button>
    );
}
