import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSymbioteEvents } from './events';
import type { SymbioteEvent, ConnectionState } from './events';

interface EventsContextValue {
    lastEvent: SymbioteEvent | null;
    connectionState: ConnectionState;
    eventCount: number;
}

const EventsContext = createContext<EventsContextValue>({
    lastEvent: null,
    connectionState: 'disconnected',
    eventCount: 0,
});

export function EventsProvider({ children }: { children: ReactNode }) {
    const { lastEvent, connectionState, eventCount } = useSymbioteEvents();
    const value = useMemo(
        () => ({ lastEvent, connectionState, eventCount }),
        [lastEvent, connectionState, eventCount],
    );
    return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents(): EventsContextValue {
    return useContext(EventsContext);
}
