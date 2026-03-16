import {
    forceSimulation,
    forceManyBody,
    forceLink,
    forceCenter,
    forceX,
    forceY,
    forceZ,
} from 'd3-force-3d';
import * as THREE from 'three';
import type { GraphData, LayoutNode, LayoutEdge, BrainLayoutResult } from '@/lib/types';

const CLUSTER_PALETTE = [
    '#60a5fa',
    '#34d399',
    '#c084fc',
    '#fbbf24',
    '#f87171',
    '#22d3ee',
    '#f472b6',
    '#a3e635',
    '#fb923c',
    '#a78bfa',
    '#2dd4bf',
    '#e879f9',
    '#facc15',
    '#fb7185',
    '#86efac',
    '#67e8f9',
    '#c4b5fd',
    '#fca5a5',
    '#38bdf8',
    '#fde68a',
];

export function getClusterColor(cluster: number): string {
    return CLUSTER_PALETTE[cluster % CLUSTER_PALETTE.length];
}

interface SimNode {
    id: string;
    x: number;
    y: number;
    z: number;
    cluster: number;
    pagerank: number;
    centrality: number;
    type: string;
    name: string;
    filePath: string;
}

function autoCluster(
    nodes: { id: string; filePath: string; metadata?: { cluster?: number } }[],
): Map<string, number> {
    const clusterMap = new Map<string, number>();
    const dirToCluster = new Map<string, number>();
    let nextCluster = 0;

    for (const n of nodes) {
        if (n.metadata?.cluster !== undefined) {
            clusterMap.set(n.id, n.metadata.cluster);
            continue;
        }

        const parts = n.filePath.replace(/^\//, '').split('/');
        const dir = parts.length > 2 ? parts.slice(0, 2).join('/') : (parts[0] ?? 'root');

        if (!dirToCluster.has(dir)) {
            dirToCluster.set(dir, nextCluster++);
        }
        clusterMap.set(n.id, dirToCluster.get(dir)!);
    }

    return clusterMap;
}

function brainShapedClusterCenters(
    clusterIds: number[],
): Map<number, { x: number; y: number; z: number }> {
    const centers = new Map<number, { x: number; y: number; z: number }>();
    const count = clusterIds.length;
    if (count === 0) return centers;

    const brainWidth = 120;
    const brainHeight = 70;
    const brainDepth = 90;

    for (let i = 0; i < count; i++) {
        const hemisphere = i % 2 === 0 ? 1 : -1;
        const t = i / Math.max(count - 1, 1);

        const yAngle = (t - 0.3) * Math.PI * 0.8;
        let y = Math.sin(yAngle) * brainHeight * 0.4;

        const lobe = Math.floor(i / 2) % 4;
        let x: number, z: number;

        switch (lobe) {
            case 0:
                x = hemisphere * brainWidth * (0.3 + t * 0.2);
                z = brainDepth * (0.3 - t * 0.1);
                break;
            case 1:
                x = hemisphere * brainWidth * (0.2 + t * 0.3);
                z = -brainDepth * (0.1 + t * 0.2);
                break;
            case 2:
                x = hemisphere * brainWidth * (0.15 + t * 0.15);
                z = -brainDepth * (0.25 + t * 0.1);
                break;
            default:
                x = hemisphere * brainWidth * (0.35 + t * 0.1);
                z = brainDepth * (0.1 + t * 0.15);
                break;
        }

        const jitterScale = 8;
        x += (Math.random() - 0.5) * jitterScale;
        y += (Math.random() - 0.5) * jitterScale;
        z += (Math.random() - 0.5) * jitterScale;

        centers.set(clusterIds[i], { x, y, z });
    }

    return centers;
}

export function computeBrainLayout(data: GraphData): BrainLayoutResult {
    const clusterAssignments = autoCluster(data.nodes);
    const clusters = new Set<number>();
    const nodeMap = new Map<string, SimNode>();

    const simNodes: SimNode[] = data.nodes.map((n) => {
        const cluster = clusterAssignments.get(n.id) ?? 0;
        clusters.add(cluster);
        const node: SimNode = {
            id: n.id,
            x: (Math.random() - 0.5) * 80,
            y: (Math.random() - 0.5) * 50,
            z: (Math.random() - 0.5) * 60,
            cluster,
            pagerank: n.metadata?.pagerank ?? 0.01,
            centrality: n.metadata?.centrality ?? 0.15,
            type: n.type,
            name: n.name,
            filePath: n.filePath,
        };
        nodeMap.set(n.id, node);
        return node;
    });

    const simLinks = data.edges
        .filter((e) => nodeMap.has(e.sourceId) && nodeMap.has(e.targetId))
        .map((e) => ({
            source: e.sourceId,
            target: e.targetId,
            type: e.type,
        }));

    const clusterCenters = brainShapedClusterCenters([...clusters]);

    const simulation = forceSimulation(simNodes, 3)
        .force('charge', forceManyBody().strength(-8))
        .force(
            'link',
            forceLink(simLinks)
                .id((d: unknown) => (d as SimNode).id)
                .distance(12)
                .strength((link: unknown) => {
                    const l = link as { source: SimNode; target: SimNode };
                    return l.source.cluster === l.target.cluster ? 1.2 : 0.05;
                }),
        )
        .force('center', forceCenter(0, 0, 0).strength(0.05))
        .force(
            'clusterX',
            forceX((d: unknown) => clusterCenters.get((d as SimNode).cluster)?.x ?? 0).strength(
                0.4,
            ),
        )
        .force(
            'clusterY',
            forceY((d: unknown) => clusterCenters.get((d as SimNode).cluster)?.y ?? 0).strength(
                0.4,
            ),
        )
        .force(
            'clusterZ',
            forceZ((d: unknown) => clusterCenters.get((d as SimNode).cluster)?.z ?? 0).strength(
                0.4,
            ),
        )
        .alpha(1)
        .alphaDecay(0.03)
        .velocityDecay(0.4)
        .stop();

    for (let i = 0; i < 200; i++) {
        simulation.tick();
    }

    const layoutNodes: LayoutNode[] = simNodes.map((n) => ({
        id: n.id,
        x: n.x,
        y: n.y,
        z: n.z,
        cluster: n.cluster,
        pagerank: n.pagerank,
        centrality: n.centrality,
        type: n.type,
        name: n.name,
        filePath: n.filePath,
    }));

    const posMap = new Map(layoutNodes.map((n) => [n.id, n]));

    const layoutEdges: LayoutEdge[] = data.edges
        .filter((e) => posMap.has(e.sourceId) && posMap.has(e.targetId))
        .map((e) => {
            const s = posMap.get(e.sourceId)!;
            const t = posMap.get(e.targetId)!;
            return {
                sourceId: e.sourceId,
                targetId: e.targetId,
                type: e.type,
                sourcePos: [s.x, s.y, s.z] as [number, number, number],
                targetPos: [t.x, t.y, t.z] as [number, number, number],
            };
        });

    return {
        nodes: layoutNodes,
        edges: layoutEdges,
        clusterCount: clusters.size,
    };
}

export function buildCurve(
    src: [number, number, number],
    tgt: [number, number, number],
): THREE.CatmullRomCurve3 {
    const s = new THREE.Vector3(...src);
    const t = new THREE.Vector3(...tgt);
    const dist = s.distanceTo(t);
    const offset = dist * 0.15;

    const perpX = (Math.random() - 0.5) * offset;
    const perpY = (Math.random() - 0.5) * offset;
    const perpZ = (Math.random() - 0.5) * offset;

    const cp1 = s
        .clone()
        .lerp(t, 0.33)
        .add(new THREE.Vector3(perpX, perpY, perpZ));
    const cp2 = s
        .clone()
        .lerp(t, 0.66)
        .add(new THREE.Vector3(-perpX * 0.7, -perpY * 0.7, perpZ * 0.5));

    return new THREE.CatmullRomCurve3([s, cp1, cp2, t]);
}
