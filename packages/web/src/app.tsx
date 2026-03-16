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
                        <div className="flex h-full items-center justify-center">
                            <div className="text-sm text-text-muted">Loading...</div>
                        </div>
                    }
                >
                    <Outlet />
                </Suspense>
            </Shell>
        </EventsProvider>
    );
}
