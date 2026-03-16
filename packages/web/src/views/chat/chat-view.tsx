import { useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ChatMessage } from '@/lib/types';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';

export function ChatView() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [streaming, setStreaming] = useState(false);

    const handleSend = useCallback(async (content: string) => {
        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content,
        };

        const assistantId = crypto.randomUUID();
        setMessages((prev) => [...prev, userMessage]);
        setStreaming(true);

        try {
            let accumulated = '';

            for await (const chunk of api.chat.send(content)) {
                accumulated += chunk;
                setMessages((prev) => {
                    const existing = prev.find(
                        (m) => m.id === assistantId
                    );
                    if (existing) {
                        return prev.map((m) =>
                            m.id === assistantId
                                ? { ...m, content: accumulated }
                                : m
                        );
                    }
                    return [
                        ...prev,
                        {
                            id: assistantId,
                            role: 'assistant',
                            content: accumulated,
                        },
                    ];
                });
            }
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    id: assistantId,
                    role: 'assistant',
                    content:
                        error instanceof Error
                            ? `Error: ${error.message}`
                            : 'Something went wrong.',
                },
            ]);
        } finally {
            setStreaming(false);
        }
    }, []);

    return (
        <div className="flex h-full flex-col">
            <MessageList
                messages={messages}
                streaming={streaming}
            />
            <ChatInput
                onSend={handleSend}
                disabled={streaming}
            />
        </div>
    );
}
