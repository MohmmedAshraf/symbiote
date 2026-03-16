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

export function useSymbioteEvents(): UseSymbioteEventsReturn {
    const [lastEvent, setLastEvent] = useState<SymbioteEvent | null>(null);
    const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
    const [eventCount, setEventCount] = useState(0);
    const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const resetIdleTimer = useCallback(() => {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        setConnectionState('connected');
        idleTimer.current = setTimeout(() => {
            setConnectionState('idle');
        }, IDLE_TIMEOUT_MS);
    }, []);

    useEffect(() => {
        const source = new EventSource('/events');

        source.onopen = () => {
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
        };

        return () => {
            source.close();
            if (idleTimer.current) clearTimeout(idleTimer.current);
        };
    }, [resetIdleTimer]);

    return { lastEvent, connectionState, eventCount };
}
