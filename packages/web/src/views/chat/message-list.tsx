import type { ChatMessage } from '@/lib/types';

interface MessageListProps {
    messages: ChatMessage[];
    streaming: boolean;
}

const SUGGESTIONS = [
    'How does auth work?',
    'What would break if I change the User model?',
    'Show me the payment flow',
    'Where are the API routes?',
];

export function MessageList({
    messages,
    streaming,
}: MessageListProps) {
    if (messages.length === 0) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <h2 className="text-lg font-semibold text-text-primary">
                    Ask Your Project
                </h2>
                <p className="max-w-md text-sm text-text-secondary">
                    Ask questions about your codebase
                    architecture, trace dependencies, analyze
                    impact of changes, or understand past
                    decisions.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => (
                        <span
                            key={s}
                            className="rounded-full bg-surface-2 px-3 py-1 text-xs text-text-secondary"
                        >
                            {s}
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="mx-auto max-w-2xl space-y-4">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-accent text-white'
                                    : 'bg-surface-1 text-text-primary'
                            }`}
                        >
                            <p className="whitespace-pre-wrap">
                                {msg.content}
                            </p>
                        </div>
                    </div>
                ))}

                {streaming && (
                    <div className="flex justify-start">
                        <div className="rounded-lg bg-surface-1 px-4 py-2.5">
                            <span className="inline-flex gap-1">
                                <span className="size-1.5 animate-pulse rounded-full bg-text-muted" />
                                <span className="size-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:150ms]" />
                                <span className="size-1.5 animate-pulse rounded-full bg-text-muted [animation-delay:300ms]" />
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
