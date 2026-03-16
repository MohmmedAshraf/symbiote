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
    '#5b8dea',
    '#34d399',
    '#c084fc',
    '#f59e0b',
    '#ef4444',
    '#06b6d4',
    '#ec4899',
    '#84cc16',
    '#f97316',
    '#8b5cf6',
    '#14b8a6',
    '#e879f9',
    '#facc15',
    '#fb923c',
    '#a3e635',
    '#2dd4bf',
    '#c4b5fd',
    '#fca5a5',
    '#67e8f9',
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

export function computeBrainLayout(data: GraphData): BrainLayoutResult {
    const clusters = new Set<number>();
    const nodeMap = new Map<string, SimNode>();

    const simNodes: SimNode[] = data.nodes.map((n) => {
        const cluster = n.metadata?.cluster ?? 0;
        clusters.add(cluster);
        const node: SimNode = {
            id: n.id,
            x: (Math.random() - 0.5) * 200,
            y: (Math.random() - 0.5) * 200,
            z: (Math.random() - 0.5) * 200,
            cluster,
            pagerank: n.metadata?.pagerank ?? 0.001,
            centrality: n.metadata?.centrality ?? 0,
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

    const clusterCenters = new Map<number, { x: number; y: number; z: number }>();
    const clusterArr = [...clusters];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    clusterArr.forEach((c, i) => {
        const theta = goldenAngle * i;
        const phi = Math.acos(1 - (2 * (i + 0.5)) / clusterArr.length);
        const r = 120;
        clusterCenters.set(c, {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta),
            z: r * Math.cos(phi),
        });
    });

    const simulation = forceSimulation(simNodes, 3)
        .force(
            'charge',
            forceManyBody().strength((d: unknown) => {
                return -30 - (d as SimNode).pagerank * 500;
            }),
        )
        .force(
            'link',
            forceLink(simLinks)
                .id((d: unknown) => (d as SimNode).id)
                .distance(40)
                .strength((link: unknown) => {
                    const l = link as { source: SimNode; target: SimNode };
                    return l.source.cluster === l.target.cluster ? 0.8 : 0.1;
                }),
        )
        .force('center', forceCenter(0, 0, 0).strength(0.02))
        .force(
            'clusterX',
            forceX((d: unknown) => clusterCenters.get((d as SimNode).cluster)?.x ?? 0).strength(
                0.15,
            ),
        )
        .force(
            'clusterY',
            forceY((d: unknown) => clusterCenters.get((d as SimNode).cluster)?.y ?? 0).strength(
                0.15,
            ),
        )
        .force(
            'clusterZ',
            forceZ((d: unknown) => clusterCenters.get((d as SimNode).cluster)?.z ?? 0).strength(
                0.15,
            ),
        )
        .alpha(1)
        .alphaDecay(0.02)
        .velocityDecay(0.3)
        .stop();

    for (let i = 0; i < 300; i++) {
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
