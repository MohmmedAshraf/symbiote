import { Suspense } from 'react';
import { Outlet } from '@tanstack/react-router';
import { Shell } from './components/shell';
import { EventsProvider } from './lib/events-context';

export function App() {
    return (
        <EventsProvider>
            <Shell>
                <Suspense
                    fallback={
                        <div className="flex h-full w-full items-center justify-center bg-surface-0">
                            <div className="text-xs text-text-muted font-mono">Loading...</div>
                        </div>
                    }
                >
                    <Outlet />
                </Suspense>
            </Shell>
        </EventsProvider>
    );
}
