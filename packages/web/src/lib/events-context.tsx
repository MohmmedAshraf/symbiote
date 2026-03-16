import { createContext, useContext, type ReactNode } from 'react';
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
    const value = useSymbioteEvents();
    return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents(): EventsContextValue {
    return useContext(EventsContext);
}
