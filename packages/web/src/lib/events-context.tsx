import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSymbioteEvents } from './events';
import type { SymbioteEvent, ConnectionState } from './events';
import type { BrainMetrics } from './brain-metrics';
import { DEFAULT_BRAIN_METRICS } from './brain-metrics';

interface EventsContextValue {
    lastEvent: SymbioteEvent | null;
    connectionState: ConnectionState;
    eventCount: number;
    brainMetrics: BrainMetrics;
}

const EventsContext = createContext<EventsContextValue>({
    lastEvent: null,
    connectionState: 'disconnected',
    eventCount: 0,
    brainMetrics: DEFAULT_BRAIN_METRICS,
});

export function EventsProvider({ children }: { children: ReactNode }) {
    const { lastEvent, connectionState, eventCount, brainMetrics } = useSymbioteEvents();
    const value = useMemo(
        () => ({ lastEvent, connectionState, eventCount, brainMetrics }),
        [lastEvent, connectionState, eventCount, brainMetrics],
    );
    return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents(): EventsContextValue {
    return useContext(EventsContext);
}
