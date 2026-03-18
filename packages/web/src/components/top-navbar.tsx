import { Link, useRouterState } from '@tanstack/react-router';
import { useEvents } from '@/lib/events-context';

const navItems = [
    { path: '/', label: 'BRAIN' },
    { path: '/health', label: 'HEALTH' },
    { path: '/dna', label: 'DNA' },
] as const;

export function TopNavbar() {
    const { location } = useRouterState();
    const { connectionState, eventCount } = useEvents();
    const statusLabel =
        connectionState === 'connected'
            ? 'BONDED'
            : connectionState === 'idle'
              ? 'IDLE'
              : 'DISCONNECTED';

    const statusColor =
        connectionState === 'connected'
            ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
            : connectionState === 'idle'
              ? 'bg-yellow-400 shadow-[0_0_6px_#facc15]'
              : 'bg-red-400';

    const statusText =
        connectionState === 'connected'
            ? 'text-emerald-400'
            : connectionState === 'idle'
              ? 'text-yellow-400'
              : 'text-red-400';

    return (
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4">
            <div className="flex items-center gap-3">
                <div className="flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-1.5">
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

                <div className="text-[13px] font-black tracking-[2px] text-blue-400">SYMBIOTE</div>

                <nav className="ml-2 flex gap-1">
                    {navItems.map(({ path, label }) => {
                        const active =
                            path === '/'
                                ? location.pathname === '/'
                                : location.pathname.startsWith(path);
                        return (
                            <Link
                                key={path}
                                to={path}
                                className={`rounded-md px-2.5 py-1 text-[10px] font-semibold no-underline transition-all duration-150
                                    ${
                                        active
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                    }`}
                            >
                                {label}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-md bg-slate-900 px-2.5 py-1">
                    <span className="text-[9px] font-medium text-slate-500">EVENTS</span>
                    <span className="text-[11px] font-bold tabular-nums text-cyan-400">
                        {eventCount}
                    </span>
                </div>

                <div className="flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1">
                    <div className={`size-1.5 rounded-full ${statusColor}`} />
                    <span className={`text-[9px] font-semibold ${statusText}`}>{statusLabel}</span>
                </div>

                <a
                    href="https://github.com/MohmmedAshraf/symbiote"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-400 no-underline transition-colors hover:border-slate-600 hover:text-slate-200"
                >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <svg
                        width={12}
                        height={12}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span className="text-[10px] font-semibold">Star</span>
                </a>
            </div>
        </header>
    );
}
