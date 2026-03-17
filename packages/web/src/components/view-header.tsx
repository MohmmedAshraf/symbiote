import { Link, useRouterState } from '@tanstack/react-router';
import { useEvents } from '@/lib/events-context';

const navItems = [
    { path: '/', label: 'BRAIN' },
    { path: '/health', label: 'HEALTH' },
    { path: '/dna', label: 'DNA' },
] as const;

export function ViewHeader({ title }: { title: string }) {
    const { location } = useRouterState();
    const { connectionState } = useEvents();
    const connected = connectionState === 'connected';

    return (
        <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-border bg-black/90 px-4">
            <div className="flex items-center gap-2.5">
                <div className="flex items-center rounded-lg border border-emerald/35 bg-emerald/15 p-1.5">
                    <svg
                        width={16}
                        height={16}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#34d399"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
                        <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
                    </svg>
                </div>

                <div>
                    <div className="text-sm font-black tracking-[2px] text-accent">{title}</div>
                    <div className={`text-[9px] ${connected ? 'text-emerald' : 'text-text-muted'}`}>
                        {connected ? 'BONDED' : 'DISCONNECTED'}
                    </div>
                </div>

                <nav className="ml-2.5 flex gap-1">
                    {navItems.map(({ path, label }) => {
                        const active =
                            path === '/'
                                ? location.pathname === '/'
                                : location.pathname.startsWith(path);
                        return (
                            <Link
                                key={path}
                                to={path}
                                className={`rounded px-2 py-0.5 text-[9px] font-medium no-underline transition-all duration-150
                                    ${
                                        active
                                            ? 'border border-emerald/50 bg-emerald/10 text-emerald'
                                            : 'border border-white/10 text-text-muted hover:border-white/20 hover:text-text-secondary'
                                    }`}
                            >
                                {label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </header>
    );
}
