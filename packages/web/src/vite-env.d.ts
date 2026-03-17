/// <reference types="vite/client" />

declare module '*.vert' {
    const shader: string;
    export default shader;
}

declare module '*.frag' {
    const shader: string;
    export default shader;
}

declare module '*.glsl' {
    const shader: string;
    export default shader;
}

declare module 'd3-force-3d' {
    export function forceSimulation(nodes?: unknown[], numDimensions?: number): ForceSimulation;
    export function forceLink(links?: unknown[]): ForceLink;
    export function forceManyBody(): ForceManyBody;
    export function forceCenter(x?: number, y?: number, z?: number): ForceCenter;
    export function forceX(x?: number | ((d: unknown) => number)): ForcePositional;
    export function forceY(y?: number | ((d: unknown) => number)): ForcePositional;
    export function forceZ(z?: number | ((d: unknown) => number)): ForcePositional;

    interface ForceSimulation {
        force(name: string, force?: unknown): ForceSimulation;
        tick(): ForceSimulation;
        stop(): ForceSimulation;
        alpha(value?: number): ForceSimulation;
        alphaDecay(value?: number): ForceSimulation;
        velocityDecay(value?: number): ForceSimulation;
    }

    interface ForceLink {
        id(fn: (d: unknown) => string): ForceLink;
        distance(d: number | ((d: unknown) => number)): ForceLink;
        strength(s: number | ((d: unknown) => number)): ForceLink;
    }

    interface ForceManyBody {
        strength(s: number | ((d: unknown) => number)): ForceManyBody;
    }

    interface ForceCenter {
        strength(s: number): ForceCenter;
    }

    interface ForcePositional {
        strength(s: number | ((d: unknown) => number)): ForcePositional;
    }
}
