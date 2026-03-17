import { useEffect, useRef, useState, useCallback } from 'react';

export interface SymbioteEvent {
    type: string;
    timestamp: number;
    data: {
        filePath?: string;
        nodeIds?: string[];
        toolName?: string;
        metadata?: Record<string, unknown>;
    };
}

export type ConnectionState = 'connected' | 'disconnected' | 'idle';

interface UseSymbioteEventsReturn {
    lastEvent: SymbioteEvent | null;
    connectionState: ConnectionState;
    eventCount: number;
}

const IDLE_TIMEOUT_MS = 30_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

export function useSymbioteEvents(): UseSymbioteEventsReturn {
    const [lastEvent, setLastEvent] = useState<SymbioteEvent | null>(null);
    const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
    const [eventCount, setEventCount] = useState(0);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const backoffMs = useRef(BACKOFF_BASE_MS);

    const resetIdleTimer = useCallback(() => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        setConnectionState('connected');
        idleTimer.current = setTimeout(() => {
            setConnectionState('idle');
        }, IDLE_TIMEOUT_MS);
    }, []);

    useEffect(() => {
        let source: EventSource | null = null;
        let disposed = false;

        function connect() {
            if (disposed) return;

            source = new EventSource('/events');

            source.onopen = () => {
                backoffMs.current = BACKOFF_BASE_MS;
                resetIdleTimer();
            };

            source.onmessage = (e) => {
                try {
                    const event: SymbioteEvent = JSON.parse(e.data);
                    if (event.type === 'connected') return;
                    setLastEvent(event);
                    setEventCount((c) => c + 1);
                    resetIdleTimer();
                } catch {
                    /* */
                }
            };

            source.onerror = () => {
                setConnectionState('disconnected');
                source?.close();
                source = null;

                if (disposed) return;

                const delay = backoffMs.current;
                backoffMs.current = Math.min(delay * 2, BACKOFF_MAX_MS);
                reconnectTimer.current = setTimeout(connect, delay);
            };
        }

        connect();

        return () => {
            disposed = true;
            source?.close();
            if (idleTimer.current) clearTimeout(idleTimer.current);
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        };
    }, [resetIdleTimer]);

    return { lastEvent, connectionState, eventCount };
}
