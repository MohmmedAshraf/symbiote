import type { ConnectionState, SymbioteEvent } from '@/lib/events';

interface StatusBarProps {
    connectionState: ConnectionState;
    lastEvent: SymbioteEvent | null;
    eventCount: number;
}

const STATE_COLORS: Record<ConnectionState, string> = {
    connected: 'bg-success',
    idle: 'bg-warning',
    disconnected: 'bg-text-muted/30',
};

export function StatusBar({ connectionState, lastEvent, eventCount }: StatusBarProps) {
    const dotColor = STATE_COLORS[connectionState];
    const label =
        connectionState === 'connected'
            ? 'Bonded'
            : connectionState === 'idle'
              ? 'Idle'
              : 'Disconnected';

    return (
        <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-lg bg-surface-1/80 px-3 py-2 text-xs text-text-muted backdrop-blur-sm">
            <span className="flex items-center gap-1.5">
                <span className={`inline-block size-2 rounded-full ${dotColor}`} />
                {label}
            </span>
            {lastEvent && (
                <>
                    <span className="text-text-muted/50">|</span>
                    <span>
                        {lastEvent.type}
                        {lastEvent.data.filePath && (
                            <span className="text-text-secondary ml-1">
                                {lastEvent.data.filePath}
                            </span>
                        )}
                    </span>
                </>
            )}
            {eventCount > 0 && (
                <>
                    <span className="text-text-muted/50">|</span>
                    <span>
                        <span className="text-text-secondary">{eventCount}</span> events
                    </span>
                </>
            )}
        </div>
    );
}
