import { useState, type FormEvent } from 'react';

interface DnaEditorProps {
    initialContent: string;
    onSave: (content: string) => void;
    onCancel: () => void;
}

export function DnaEditor({
    initialContent,
    onSave,
    onCancel,
}: DnaEditorProps) {
    const [content, setContent] = useState(initialContent);

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const trimmed = content.trim();
        if (trimmed) onSave(trimmed);
    }

    return (
        <form onSubmit={handleSubmit} className="mt-2 space-y-2">
            <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border-subtle bg-surface-0 px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
            <div className="flex gap-2">
                <button
                    type="submit"
                    className="rounded px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
                >
                    Save
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded px-2.5 py-1 text-xs font-medium text-text-muted hover:bg-surface-2"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
