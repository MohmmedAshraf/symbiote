import type { ReactNode } from 'react';

export function Shell({ children }: { children: ReactNode }) {
    return <div className="h-screen w-screen overflow-hidden bg-[#000108]">{children}</div>;
}
