import type { ReactNode } from 'react';
import { TabBar } from './tab-bar';

export function Shell({ children }: { children: ReactNode }) {
    return (
        <div className="flex h-screen w-screen overflow-hidden">
            <TabBar />
            <main className="flex-1 overflow-auto">{children}</main>
        </div>
    );
}
