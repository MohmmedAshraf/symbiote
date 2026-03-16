import type { NodeContext } from '@/lib/types';
import { StatusBadge } from '@/components/status-badge';

interface NodeSidebarProps {
    context: NodeContext;
    onClose: () => void;
}

export function NodeSidebar({ context, onClose }: NodeSidebarProps) {
    const { node, dependencies, dependents, constraints, decisions } =
        context;

    return (
        <aside className="absolute right-0 top-0 flex h-full w-80 flex-col border-l border-border bg-surface-0/95 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-text-primary">
                        {node.name}
                    </h2>
                    <p className="truncate text-xs text-text-muted">
                        {node.filePath}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="ml-2 flex size-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface-2 hover:text-text-primary"
                >
                    <XIcon className="size-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <Section title="Info">
                    <Row label="Type" value={node.type} />
                    <Row
                        label="Lines"
                        value={`${node.lineStart}-${node.lineEnd}`}
                    />
                </Section>

                <Section
                    title={`Dependencies (${dependencies.length})`}
                >
                    {dependencies.length === 0 && (
                        <p className="text-xs text-text-muted">
                            None
                        </p>
                    )}
                    {dependencies.map((dep) => (
                        <NodeLink
                            key={dep.id}
                            name={dep.name}
                            type={dep.type}
                        />
                    ))}
                </Section>

                <Section
                    title={`Dependents (${dependents.length})`}
                >
                    {dependents.length === 0 && (
                        <p className="text-xs text-text-muted">
                            None
                        </p>
                    )}
                    {dependents.map((dep) => (
                        <NodeLink
                            key={dep.id}
                            name={dep.name}
                            type={dep.type}
                        />
                    ))}
                </Section>

                {constraints.length > 0 && (
                    <Section title="Constraints">
                        {constraints.map((c) => (
                            <div
                                key={c.id}
                                className="text-xs text-text-secondary"
                            >
                                <StatusBadge variant="warning">
                                    {c.status}
                                </StatusBadge>
                                <p className="mt-1">{c.content}</p>
                            </div>
                        ))}
                    </Section>
                )}

                {decisions.length > 0 && (
                    <Section title="Decisions">
                        {decisions.map((d) => (
                            <div
                                key={d.id}
                                className="text-xs text-text-secondary"
                            >
                                <StatusBadge variant="info">
                                    {d.status}
                                </StatusBadge>
                                <p className="mt-1">{d.content}</p>
                            </div>
                        ))}
                    </Section>
                )}
            </div>
        </aside>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="border-b border-border-subtle px-4 py-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                {title}
            </h3>
            <div className="space-y-1.5">{children}</div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between text-xs">
            <span className="text-text-muted">{label}</span>
            <span className="text-text-secondary">{value}</span>
        </div>
    );
}

function NodeLink({ name, type }: { name: string; type: string }) {
    return (
        <div className="flex items-center gap-1.5 text-xs">
            <span className="text-text-muted">{type}</span>
            <span className="text-text-secondary">{name}</span>
        </div>
    );
}

function XIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}
