import type * as THREE from 'three';

export interface Lobe {
    index: number;
    name: string;
    color: string;
    community: number;
    position: THREE.Vector3;
    nodeCount: number;
}

export interface SignalAnimation {
    state: 'idle' | 'moving' | 'decaying';
    progress: number;
    decay: number;
    trail: THREE.Line;
    packet: THREE.Mesh;
    p0: THREE.Vector3;
    p1: THREE.Vector3;
    p2: THREE.Vector3;
}

export interface SignalWave {
    id: number;
    color: THREE.Color;
    startPos: THREE.Vector3;
    targetLobe: Lobe;
    progress: number;
    speed: number;
}

export interface FeedItem {
    id: number;
    type: string;
    filePath: string;
    lobe: string;
    color: string;
    timestamp: string;
}

export interface BrainState {
    velocity: number;
    eventCount: number;
    consciousness: number;
    lobeActivity: number[];
    activeLobe: string | null;
    activeSignal: string | null;
    signalProgress: number;
}

export const DEFAULT_BRAIN_STATE: BrainState = {
    velocity: 0,
    eventCount: 0,
    consciousness: 0,
    lobeActivity: [],
    activeLobe: null,
    activeSignal: null,
    signalProgress: 0,
};

export const OUTER_RADIUS = 155;
export const INNER_RADIUS = 105;
export const OUTER_COUNT = 200_000;
export const INNER_COUNT = 150_000;
export const MAX_RIPPLES = 32;
export const MAX_ACTIVE_NEURONS = 50;
export const SIGNAL_POOL_SIZE = 200;
export const PULSE_RING_POOL = 24;
export const PULSE_RING_DOTS = 80;
