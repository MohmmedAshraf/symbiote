import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { GraphData, LayoutNode } from '@/lib/types';
import { computeBrainLayout, buildCurve } from './brain-layout';
import { Neurons } from './neurons';
import { Synapses } from './synapses';
import { Impulses } from './impulses';
import { Atmosphere } from './atmosphere';
import { NodeLabel } from './node-label';

interface BrainSceneProps {
    data: GraphData;
    onNodeClick: (nodeId: string) => void;
    selectedNodeId: string | null;
}

const MAX_RENDERED_EDGES = 3000;

function CameraController({ target }: { target: THREE.Vector3 | null }) {
    const { camera } = useThree();
    const targetRef = useRef<THREE.Vector3 | null>(null);
    const progressRef = useRef(0);

    useEffect(() => {
        if (target) {
            targetRef.current = target.clone();
            progressRef.current = 0;
        }
    }, [target]);

    useFrame((_, delta) => {
        if (!targetRef.current || progressRef.current >= 1) return;

        progressRef.current = Math.min(progressRef.current + delta * 1.2, 1);
        const t = 1 - Math.pow(1 - progressRef.current, 3);

        const offset = new THREE.Vector3(30, 20, 30);
        const destination = targetRef.current.clone().add(offset);
        camera.position.lerp(destination, t);
        camera.lookAt(targetRef.current);
    });

    return null;
}

function SceneContent({
    data,
    onNodeClick,
    selectedNodeId,
    onHover,
}: BrainSceneProps & {
    onHover: (id: string | null, pos: { x: number; y: number } | null) => void;
}) {
    const layout = useMemo(() => computeBrainLayout(data), [data]);

    const nodeClusterMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const n of layout.nodes) {
            map.set(n.id, n.cluster);
        }
        return map;
    }, [layout]);

    const connectedIds = useMemo(() => {
        if (!selectedNodeId) return new Set<string>();
        const ids = new Set<string>();
        for (const e of layout.edges) {
            if (e.sourceId === selectedNodeId) ids.add(e.targetId);
            if (e.targetId === selectedNodeId) ids.add(e.sourceId);
        }
        return ids;
    }, [selectedNodeId, layout.edges]);

    const cameraTarget = useMemo(() => {
        if (!selectedNodeId) return null;
        const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
        const node = nodeMap.get(selectedNodeId);
        if (!node) return null;
        return new THREE.Vector3(node.x, node.y, node.z);
    }, [selectedNodeId, layout.nodes]);

    const culledEdges = useMemo(() => {
        if (layout.edges.length <= MAX_RENDERED_EDGES) return layout.edges;

        const nodePagerank = new Map<string, number>();
        for (const n of layout.nodes) {
            nodePagerank.set(n.id, n.pagerank);
        }

        const scored = layout.edges.map((e) => {
            const srcRank = nodePagerank.get(e.sourceId) ?? 0;
            const tgtRank = nodePagerank.get(e.targetId) ?? 0;
            const typeBonus = e.type === 'calls' ? 0.5 : 0;
            return { edge: e, score: srcRank + tgtRank + typeBonus };
        });

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, MAX_RENDERED_EDGES).map((s) => s.edge);
    }, [layout]);

    const curves = useMemo(() => {
        return culledEdges.map((e) => buildCurve(e.sourcePos, e.targetPos));
    }, [culledEdges]);

    return (
        <>
            <color attach="background" args={['#050508']} />
            <fogExp2 attach="fog" args={['#050508', 0.003]} />

            <ambientLight intensity={0.15} />
            <directionalLight position={[50, 80, 30]} intensity={0.3} />

            <CameraController target={cameraTarget} />
            <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.05}
                minDistance={20}
                maxDistance={500}
            />

            <Neurons
                nodes={layout.nodes}
                selectedId={selectedNodeId}
                connectedIds={connectedIds}
                onNodeClick={onNodeClick}
                onNodeHover={onHover}
            />

            <Synapses
                edges={culledEdges}
                curves={curves}
                nodeClusterMap={nodeClusterMap}
                selectedId={selectedNodeId}
                connectedIds={connectedIds}
            />

            <Impulses
                edges={culledEdges}
                curves={curves}
                nodeClusterMap={nodeClusterMap}
                selectedId={selectedNodeId}
            />

            <Atmosphere />

            <EffectComposer>
                <Bloom
                    intensity={1.5}
                    luminanceThreshold={0.6}
                    luminanceSmoothing={0.4}
                    mipmapBlur
                />
                <Vignette offset={0.3} darkness={0.7} />
            </EffectComposer>
        </>
    );
}

export function BrainScene({ data, onNodeClick, selectedNodeId }: BrainSceneProps) {
    const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);
    const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

    const layout = useMemo(() => computeBrainLayout(data), [data]);
    const nodeMap = useMemo(() => {
        const map = new Map<string, LayoutNode>();
        for (const n of layout.nodes) {
            map.set(n.id, n);
        }
        return map;
    }, [layout]);

    const handleHover = useCallback(
        (id: string | null, pos: { x: number; y: number } | null) => {
            if (id) {
                setHoveredNode(nodeMap.get(id) ?? null);
                setHoverPos(pos);
            } else {
                setHoveredNode(null);
                setHoverPos(null);
            }
        },
        [nodeMap],
    );

    return (
        <div className="relative h-full w-full">
            <Canvas
                camera={{ position: [0, 80, 200], fov: 60, near: 0.1, far: 2000 }}
                gl={{
                    antialias: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.2,
                }}
                dpr={[1, 2]}
            >
                <SceneContent
                    data={data}
                    onNodeClick={onNodeClick}
                    selectedNodeId={selectedNodeId}
                    onHover={handleHover}
                />
            </Canvas>

            <NodeLabel node={hoveredNode} position={hoverPos} />
        </div>
    );
}
