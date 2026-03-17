import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { useEvents } from '@/lib/events-context';
import { api } from '@/lib/api';
import { BrainRenderer } from './brain-renderer';
import type { FeedItem, BrainState, Lobe } from './brain-types';
import { DEFAULT_BRAIN_STATE } from './brain-types';

export function BrainView() {
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<BrainRenderer | null>(null);
    const { lastEvent, connectionState } = useEvents();

    const [liveFeed, setLiveFeed] = useState<FeedItem[]>([]);
    const [brainState, setBrainState] = useState<BrainState>(DEFAULT_BRAIN_STATE);
    const [lobes, setLobes] = useState<Lobe[]>([]);
    const [showLeft, setShowLeft] = useState(true);
    const [showRight, setShowRight] = useState(true);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const stateCallbackRef = useRef(setBrainState);
    stateCallbackRef.current = setBrainState;

    const stableCallback = useCallback((state: BrainState) => {
        stateCallbackRef.current(state);
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;

        let disposed = false;
        const container = containerRef.current;

        api.graph
            .getCortexData()
            .then(({ data }) => {
                if (disposed) return;
                const renderer = new BrainRenderer(container, stableCallback);
                renderer.init(data);
                rendererRef.current = renderer;
                setLobes(renderer.getLobes());
                setIsReady(true);
            })
            .catch((e) => {
                if (!disposed) setError(e.message);
            });

        return () => {
            disposed = true;
            rendererRef.current?.dispose();
            rendererRef.current = null;
        };
    }, [stableCallback]);

    useEffect(() => {
        if (!lastEvent || !rendererRef.current) return;
        const feedItem = rendererRef.current.processEvent(lastEvent);
        if (feedItem) {
            setLiveFeed((prev) => [feedItem, ...prev].slice(0, 60));
        }
    }, [lastEvent]);

    useEffect(() => {
        rendererRef.current?.setPlaying(isPlaying);
    }, [isPlaying]);

    const connected = connectionState === 'connected';
    const LP = 260;
    const RP = 240;

    if (error) {
        return (
            <div
                style={{
                    width: '100vw',
                    height: '100vh',
                    background: '#000108',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f87171',
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 14,
                }}
            >
                Failed to load brain: {error}
            </div>
        );
    }

    return (
        <div
            style={{
                display: 'flex',
                width: '100vw',
                height: '100vh',
                background: '#000108',
                color: '#f1f5f9',
                fontFamily: 'ui-monospace, monospace',
                userSelect: 'none',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

            <TopBar
                isPlaying={isPlaying}
                onTogglePlay={() => setIsPlaying((p) => !p)}
                showLeft={showLeft}
                showRight={showRight}
                onToggleLeft={() => setShowLeft((v) => !v)}
                onToggleRight={() => setShowRight((v) => !v)}
                brainState={brainState}
                consciousness={brainState.consciousness}
                connected={connected}
            />

            <LeftPanel show={showLeft} width={LP} liveFeed={liveFeed} connected={connected} />

            <RightPanel show={showRight} width={RP} brainState={brainState} lobes={lobes} />

            <BottomBar lobes={lobes} onZoom={(z) => rendererRef.current?.setZoom(z)} />

            {!isReady && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'black',
                        zIndex: 50,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <svg
                        width={40}
                        height={40}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth={2}
                        style={{ opacity: 0.4, animation: 'spin 1s linear infinite' }}
                    >
                        <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                </div>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes feedIn {
                    from { opacity: 0; transform: translateX(-8px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
}

function TopBar({
    isPlaying,
    onTogglePlay,
    showLeft,
    showRight,
    onToggleLeft,
    onToggleRight,
    brainState,
    consciousness,
    connected,
}: {
    isPlaying: boolean;
    onTogglePlay: () => void;
    showLeft: boolean;
    showRight: boolean;
    onToggleLeft: () => void;
    onToggleRight: () => void;
    brainState: BrainState;
    consciousness: number;
    connected: boolean;
}) {
    const { location } = useRouterState();

    const navItems = [
        { path: '/', label: 'BRAIN' },
        { path: '/health', label: 'HEALTH' },
        { path: '/dna', label: 'DNA' },
    ] as const;

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 46,
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                background: 'rgba(0,0,0,0.9)',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                pointerEvents: 'auto',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                    style={{
                        background: 'rgba(5,150,105,0.6)',
                        padding: '5px 8px',
                        borderRadius: 7,
                        border: '1px solid rgba(52,211,153,0.35)',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
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
                    <div
                        style={{
                            fontWeight: 900,
                            fontSize: 14,
                            color: '#60a5fa',
                            letterSpacing: 2,
                        }}
                    >
                        SYMBIOTE
                    </div>
                    <div style={{ fontSize: 9, color: '#34d399' }}>
                        {(consciousness * 100).toFixed(0)}% Active
                        {' · '}
                        {isPlaying ? 'LIVE' : 'PAUSED'}
                        {' · '}
                        {connected ? 'BONDED' : 'DISCONNECTED'}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 4, marginLeft: 10 }}>
                    {navItems.map(({ path, label }) => {
                        const active =
                            path === '/'
                                ? location.pathname === '/'
                                : location.pathname.startsWith(path);
                        return (
                            <Link
                                key={path}
                                to={path}
                                style={{
                                    fontSize: 9,
                                    padding: '3px 8px',
                                    borderRadius: 4,
                                    border: `1px solid ${active ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                    background: active ? 'rgba(52,211,153,0.1)' : 'transparent',
                                    color: active ? '#34d399' : '#334155',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    transition: 'all 0.2s',
                                    textDecoration: 'none',
                                }}
                            >
                                {label}
                            </Link>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
                    <button
                        onClick={onToggleLeft}
                        style={{
                            fontSize: 9,
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: `1px solid ${showLeft ? 'rgba(52,211,153,0.5)' : 'rgba(255,255,255,0.1)'}`,
                            background: showLeft ? 'rgba(52,211,153,0.1)' : 'transparent',
                            color: showLeft ? '#34d399' : '#334155',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'all 0.2s',
                        }}
                    >
                        {showLeft ? '\u25C0' : '\u25B6'} FEED
                    </button>
                    <button
                        onClick={onToggleRight}
                        style={{
                            fontSize: 9,
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: `1px solid ${showRight ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                            background: showRight ? 'rgba(96,165,250,0.1)' : 'transparent',
                            color: showRight ? '#60a5fa' : '#334155',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'all 0.2s',
                        }}
                    >
                        BRAIN {showRight ? '\u25B6' : '\u25C0'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                {(
                    [
                        ['PULSE', brainState.velocity, '#34d399'],
                        ['EVENTS', brainState.eventCount, '#facc15'],
                        ['SIGNALS', brainState.signalProgress, '#22d3ee'],
                        ['AWARENESS', Math.round(consciousness * 100), '#c084fc'],
                    ] as const
                ).map(([label, value, color]) => (
                    <div
                        key={label}
                        style={{
                            background: 'rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 5,
                            padding: '3px 8px',
                            textAlign: 'center',
                            minWidth: 52,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 8,
                                color: '#334155',
                                letterSpacing: 0.5,
                            }}
                        >
                            {label}
                        </div>
                        <div
                            style={{
                                fontWeight: 900,
                                fontSize: 12,
                                color,
                            }}
                        >
                            {value}
                        </div>
                    </div>
                ))}

                <button
                    onClick={onTogglePlay}
                    style={{
                        padding: '5px 10px',
                        borderRadius: 5,
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: isPlaying ? 'rgba(15,23,42,0.7)' : 'rgba(37,99,235,0.7)',
                        color: 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                    }}
                >
                    {isPlaying ? (
                        <>
                            <svg
                                width={10}
                                height={10}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                            </svg>
                            PAUSE
                        </>
                    ) : (
                        <>
                            <svg
                                width={10}
                                height={10}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path d="M5 3l14 9-14 9V3z" />
                            </svg>
                            PLAY
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

function LeftPanel({
    show,
    width,
    liveFeed,
    connected,
}: {
    show: boolean;
    width: number;
    liveFeed: FeedItem[];
    connected: boolean;
}) {
    return (
        <div
            style={{
                position: 'absolute',
                top: 46,
                left: show ? 0 : -width,
                bottom: 42,
                width,
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(0,1,10,0.93)',
                borderRight: '1px solid rgba(255,255,255,0.07)',
                transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
                pointerEvents: show ? 'auto' : 'none',
            }}
        >
            <div
                style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                }}
            >
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#34d399',
                        letterSpacing: 1,
                    }}
                >
                    LIVE EVENTS
                </span>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                    }}
                >
                    <div
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: connected ? '#34d399' : '#ef4444',
                            boxShadow: connected ? '0 0 6px #34d399' : 'none',
                        }}
                    />
                    <span style={{ fontSize: 8, color: '#334155' }}>
                        {connected ? 'LIVE' : 'CONNECTING'}
                    </span>
                </div>
            </div>

            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '3px 0',
                }}
            >
                {liveFeed.length === 0 && (
                    <div
                        style={{
                            padding: '20px 14px',
                            fontSize: 11,
                            color: '#1e293b',
                            textAlign: 'center',
                        }}
                    >
                        Waiting for events...
                    </div>
                )}
                {liveFeed.map((item, i) => (
                    <div
                        key={item.id}
                        style={{
                            padding: '8px 12px 6px 10px',
                            borderLeft: `3px solid ${item.color}`,
                            marginBottom: 1,
                            background: i === 0 ? 'rgba(255,255,255,0.035)' : 'transparent',
                            opacity: Math.max(0.2, 1 - i * 0.022),
                            animation: i === 0 ? 'feedIn 0.3s ease-out' : undefined,
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 3,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: item.color,
                                    background: `${item.color}1a`,
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                    letterSpacing: 0.5,
                                }}
                            >
                                {item.type}
                            </span>
                            <span style={{ fontSize: 8, color: '#1e293b' }}>{item.timestamp}</span>
                        </div>
                        <div
                            style={{
                                fontSize: 10,
                                color: '#64748b',
                                wordBreak: 'break-all',
                                lineHeight: 1.4,
                                marginBottom: 2,
                            }}
                        >
                            {item.filePath}
                        </div>
                        <div style={{ fontSize: 8, color: '#1e293b' }}>
                            {'\u2192'} {item.lobe}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RightPanel({
    show,
    width,
    brainState,
    lobes,
}: {
    show: boolean;
    width: number;
    brainState: BrainState;
    lobes: Lobe[];
}) {
    return (
        <div
            style={{
                position: 'absolute',
                top: 46,
                right: show ? 0 : -width,
                bottom: 42,
                width,
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(0,1,10,0.93)',
                borderLeft: '1px solid rgba(255,255,255,0.07)',
                transition: 'right 0.22s cubic-bezier(0.4,0,0.2,1)',
                pointerEvents: show ? 'auto' : 'none',
                overflowY: 'auto',
            }}
        >
            <div
                style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 5,
                    }}
                >
                    <span
                        style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#334155',
                            letterSpacing: 1,
                        }}
                    >
                        AWARENESS
                    </span>
                    <span
                        style={{
                            fontSize: 14,
                            fontWeight: 900,
                            color: '#c084fc',
                        }}
                    >
                        {(brainState.consciousness * 100).toFixed(1)}%
                    </span>
                </div>
                <div
                    style={{
                        height: 5,
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 3,
                        overflow: 'hidden',
                        marginBottom: 3,
                    }}
                >
                    <div
                        style={{
                            height: '100%',
                            width: `${brainState.consciousness * 100}%`,
                            background: 'linear-gradient(90deg, #7c3aed, #c084fc)',
                            borderRadius: 3,
                            transition: 'width 0.5s',
                        }}
                    />
                </div>
                <div style={{ fontSize: 9, color: '#334155' }}>
                    {brainState.activeSignal ?? 'Awaiting input...'}
                </div>
            </div>

            {brainState.activeSignal && (
                <div
                    style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        flexShrink: 0,
                    }}
                >
                    <div
                        style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: '#334155',
                            letterSpacing: 1,
                            marginBottom: 5,
                        }}
                    >
                        ACTIVE SIGNAL
                    </div>
                    <div style={{ fontSize: 8, color: '#334155', marginBottom: 1 }}>ROUTING TO</div>
                    <div
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#60a5fa',
                            marginBottom: 5,
                        }}
                    >
                        {brainState.activeLobe}
                    </div>
                    <div
                        style={{
                            height: 3,
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: 2,
                        }}
                    >
                        <div
                            style={{
                                height: '100%',
                                width: `${brainState.signalProgress}%`,
                                background: '#60a5fa',
                                borderRadius: 2,
                                transition: 'width 0.1s',
                            }}
                        />
                    </div>
                </div>
            )}

            <div
                style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#334155',
                        letterSpacing: 1,
                        marginBottom: 6,
                    }}
                >
                    LOBE ACTIVITY
                </div>
                {lobes.map((lobe, idx) => (
                    <div key={lobe.community} style={{ marginBottom: 6 }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: 2,
                            }}
                        >
                            <span style={{ fontSize: 9, color: '#475569' }}>{lobe.name}</span>
                            <span
                                style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    color: lobe.color,
                                }}
                            >
                                {Math.round((brainState.lobeActivity[idx] ?? 0) * 100)}%
                            </span>
                        </div>
                        <div
                            style={{
                                height: 3,
                                background: 'rgba(255,255,255,0.05)',
                                borderRadius: 2,
                            }}
                        >
                            <div
                                style={{
                                    height: '100%',
                                    width: `${(brainState.lobeActivity[idx] ?? 0) * 100}%`,
                                    background: lobe.color,
                                    borderRadius: 2,
                                    transition: 'width 0.2s',
                                }}
                            />
                        </div>
                        <div
                            style={{
                                fontSize: 8,
                                color: '#1e293b',
                                marginTop: 1,
                            }}
                        >
                            {lobe.nodeCount} nodes
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ padding: '8px 12px', flexShrink: 0 }}>
                <div
                    style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: '#334155',
                        letterSpacing: 1,
                        marginBottom: 6,
                    }}
                >
                    NEURAL METRICS
                </div>
                {(
                    [
                        ['Velocity', brainState.velocity, '#facc15', 120],
                        ['Events', brainState.eventCount, '#22d3ee', 200],
                        ['Awareness', Math.round(brainState.consciousness * 100), '#c084fc', 100],
                    ] as const
                ).map(([label, val, color, max]) => (
                    <div key={label} style={{ marginBottom: 6 }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: 2,
                            }}
                        >
                            <span style={{ fontSize: 9, color: '#475569' }}>{label}</span>
                            <span
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color,
                                }}
                            >
                                {val}
                            </span>
                        </div>
                        <div
                            style={{
                                height: 3,
                                background: 'rgba(255,255,255,0.05)',
                                borderRadius: 2,
                            }}
                        >
                            <div
                                style={{
                                    height: '100%',
                                    width: `${Math.min(100, (val / max) * 100)}%`,
                                    background: color,
                                    borderRadius: 2,
                                    opacity: 0.75,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function BottomBar({ lobes, onZoom }: { lobes: Lobe[]; onZoom: (zoom: number) => void }) {
    return (
        <div
            style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 42,
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                background: 'rgba(0,0,0,0.9)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                pointerEvents: 'auto',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                }}
            >
                <span
                    style={{
                        fontSize: 8,
                        color: '#1e293b',
                        marginRight: 4,
                        letterSpacing: 1,
                    }}
                >
                    ZOOM
                </span>
                {(
                    [
                        [50, 'Deep'],
                        [200, 'Close'],
                        [580, 'Default'],
                        [1200, 'Far'],
                        [3000, 'Max'],
                    ] as const
                ).map(([z, label]) => (
                    <button
                        key={z}
                        onClick={() => onZoom(z)}
                        style={{
                            fontSize: 9,
                            padding: '3px 8px',
                            borderRadius: 4,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(15,23,42,0.5)',
                            color: '#475569',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        {label}
                    </button>
                ))}
                <span
                    style={{
                        fontSize: 8,
                        color: '#1e293b',
                        marginLeft: 6,
                    }}
                >
                    scroll · +/- · 0
                </span>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                }}
            >
                {lobes.map((lobe) => (
                    <div
                        key={lobe.community}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                        }}
                    >
                        <div
                            style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: lobe.color,
                                boxShadow: `0 0 3px ${lobe.color}`,
                            }}
                        />
                        <span style={{ fontSize: 8, color: '#334155' }}>
                            {lobe.name.split(' ')[0]}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
