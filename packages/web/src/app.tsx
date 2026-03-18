import { Suspense } from 'react';
import { Outlet } from '@tanstack/react-router';
import { EventsProvider } from './lib/events-context';
import { BrainProvider } from './lib/brain-context';
import { TopNavbar } from './components/top-navbar';
import { LeftSidebar } from './components/left-sidebar';
import { RightSidebar } from './components/right-sidebar';

export function App() {
    return (
        <EventsProvider>
            <BrainProvider>
                <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 font-mono text-slate-100">
                    <TopNavbar />
                    <div className="flex flex-1 overflow-hidden">
                        <LeftSidebar />
                        <main className="relative flex-1 overflow-hidden">
                            <Suspense
                                fallback={
                                    <div className="flex h-full w-full items-center justify-center">
                                        <div className="text-xs text-slate-500">Loading...</div>
                                    </div>
                                }
                            >
                                <Outlet />
                            </Suspense>
                        </main>
                        <RightSidebar />
                    </div>
                </div>
            </BrainProvider>
        </EventsProvider>
    );
}
