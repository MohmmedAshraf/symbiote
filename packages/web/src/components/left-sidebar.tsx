import { useState, useEffect } from 'react';
import { useEvents } from '@/lib/events-context';

interface FeedEntry {
    id: string;
    type: string;
    filePath?: string;
    timestamp: string;
    color: string;
}

const EVENT_COLORS: Record<string, string> = {
    'file:read': '#60a5fa',
    'file:edit': '#facc15',
    'file:create': '#34d399',
    'node:reindexed': '#22d3ee',
    'scan:complete': '#c084fc',
    'dna:recorded': '#f472b6',
    'dna:promoted': '#34d399',
    'correction:detected': '#fb923c',
    'context:cluster': '#818cf8',
    'constraint:violated': '#f87171',
    'impact:ripple': '#fbbf24',
};

export function LeftSidebar() {
    const { lastEvent, connectionState } = useEvents();
    const [feed, setFeed] = useState<FeedEntry[]>([]);

    useEffect(() => {
        if (!lastEvent) return;
        const entry: FeedEntry = {
            id: `${lastEvent.timestamp}-${Math.random().toString(36).slice(2, 7)}`,
            type: lastEvent.type,
            filePath: lastEvent.data?.filePath,
            timestamp: new Date(lastEvent.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            }),
            color: EVENT_COLORS[lastEvent.type] ?? '#64748b',
        };
        setFeed((prev) => [entry, ...prev].slice(0, 80));
    }, [lastEvent]);

    return (
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-800/60 px-4 py-3">
                <span className="text-[9px] font-semibold tracking-[1.5px] text-slate-500">
                    LIVE EVENTS
                </span>
                <div className="flex items-center gap-1.5">
                    <div
                        className={`size-1.5 rounded-full ${
                            connectionState === 'connected'
                                ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                                : connectionState === 'idle'
                                  ? 'bg-yellow-400 shadow-[0_0_4px_#facc15]'
                                  : 'bg-slate-500'
                        }`}
                    />
                    <span
                        className={`text-[8px] font-medium ${
                            connectionState === 'connected'
                                ? 'text-emerald-400'
                                : connectionState === 'idle'
                                  ? 'text-yellow-400'
                                  : 'text-slate-500'
                        }`}
                    >
                        {connectionState === 'connected'
                            ? 'LIVE'
                            : connectionState === 'idle'
                              ? 'IDLE'
                              : 'OFFLINE'}
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
                {feed.length === 0 && (
                    <div className="px-4 py-12 text-center text-[11px] text-slate-600">
                        Waiting for events...
                    </div>
                )}
                {feed.map((item, i) => (
                    <div
                        key={item.id}
                        className={`mx-2 mb-0.5 rounded-md px-3 py-2 ${i === 0 ? 'animate-feed-in bg-slate-800/40' : ''}`}
                        style={{
                            borderLeft: `2px solid ${item.color}`,
                            opacity: Math.max(0.3, 1 - i * 0.015),
                        }}
                    >
                        <div className="mb-1 flex items-center justify-between">
                            <span
                                className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                                style={{
                                    color: item.color,
                                    background: `${item.color}15`,
                                }}
                            >
                                {item.type}
                            </span>
                            <span className="text-[8px] text-slate-600">{item.timestamp}</span>
                        </div>
                        {item.filePath && (
                            <div className="break-all text-[10px] leading-snug text-slate-400">
                                {item.filePath}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </aside>
    );
}
