declare module 'd3-force-3d' {
    export function forceSimulation(nodes?: unknown[], nDim?: number): ForceSimulation;
    export function forceManyBody(): ForceManyBody;
    export function forceLink(links?: unknown[]): ForceLink;
    export function forceCenter(x?: number, y?: number, z?: number): ForceCenter;
    export function forceX(x?: number | ((d: unknown) => number)): ForcePositional;
    export function forceY(y?: number | ((d: unknown) => number)): ForcePositional;
    export function forceZ(z?: number | ((d: unknown) => number)): ForcePositional;

    interface ForceSimulation {
        force(name: string, force?: unknown): ForceSimulation;
        alpha(alpha?: number): ForceSimulation;
        alphaDecay(decay?: number): ForceSimulation;
        velocityDecay(decay?: number): ForceSimulation;
        stop(): ForceSimulation;
        tick(): ForceSimulation;
    }

    interface ForceManyBody {
        strength(strength?: number | ((d: unknown) => number)): ForceManyBody;
    }

    interface ForceLink {
        id(fn: (d: unknown) => string): ForceLink;
        distance(distance?: number | ((d: unknown) => number)): ForceLink;
        strength(strength?: number | ((d: unknown) => number)): ForceLink;
    }

    interface ForceCenter {
        strength(strength?: number): ForceCenter;
    }

    interface ForcePositional {
        strength(strength?: number): ForcePositional;
    }
}
