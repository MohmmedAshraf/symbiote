import { Link, useRouterState } from '@tanstack/react-router';

const tabs = [
    { path: '/', label: 'Brain Graph', icon: BrainIcon },
    { path: '/chat', label: 'Ask Project', icon: ChatIcon },
    { path: '/health', label: 'Health Pulse', icon: HeartIcon },
    { path: '/dna', label: 'DNA Lab', icon: DnaIcon },
] as const;

export function TabBar() {
    const { location } = useRouterState();

    return (
        <nav className="flex w-14 flex-col items-center gap-1 border-r border-border bg-surface-0 py-4">
            {tabs.map(({ path, label, icon: Icon }) => {
                const active =
                    path === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(path);

                return (
                    <Link
                        key={path}
                        to={path}
                        className={`group flex size-10 items-center justify-center rounded-md transition-colors ${
                            active
                                ? 'bg-surface-2 text-text-primary'
                                : 'text-text-muted hover:bg-surface-1 hover:text-text-secondary'
                        }`}
                        title={label}
                    >
                        <Icon className="size-5" />
                    </Link>
                );
            })}

            <div className="mt-auto px-2">
                <div
                    className="size-2 rounded-full bg-success"
                    title="Connected"
                />
            </div>
        </nav>
    );
}

function BrainIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
        >
            <circle cx="12" cy="12" r="3" />
            <circle cx="5" cy="6" r="2" />
            <circle cx="19" cy="6" r="2" />
            <circle cx="5" cy="18" r="2" />
            <circle cx="19" cy="18" r="2" />
            <line x1="9.5" y1="10" x2="6.5" y2="7.5" />
            <line x1="14.5" y1="10" x2="17.5" y2="7.5" />
            <line x1="9.5" y1="14" x2="6.5" y2="16.5" />
            <line x1="14.5" y1="14" x2="17.5" y2="16.5" />
        </svg>
    );
}

function ChatIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
        >
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
    );
}

function HeartIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
        >
            <path d="M3.343 7.778a4.5 4.5 0 017.339-1.46L12 7.636l1.318-1.318a4.5 4.5 0 016.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364v-.54z" />
        </svg>
    );
}

function DnaIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
        >
            <path d="M2 15c6.667-6 13.333 0 20-6" />
            <path d="M2 9c6.667 6 13.333 0 20 6" />
            <line x1="7" y1="9" x2="7" y2="15" />
            <line x1="12" y1="7" x2="12" y2="17" />
            <line x1="17" y1="9" x2="17" y2="15" />
        </svg>
    );
}
