import { useState, useRef, type FormEvent } from 'react';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed || disabled) return;
        onSend(trimmed);
        setValue('');
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="border-t border-border bg-surface-0 px-6 py-4"
        >
            <div className="mx-auto flex max-w-2xl items-end gap-2">
                <textarea
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your codebase..."
                    disabled={disabled}
                    rows={1}
                    className="flex-1 resize-none rounded-lg border border-border-subtle bg-surface-1 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none disabled:opacity-50"
                />
                <button
                    type="submit"
                    disabled={disabled || !value.trim()}
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                >
                    <SendIcon className="size-4" />
                </button>
            </div>
        </form>
    );
}

function SendIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
        >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
    );
}
