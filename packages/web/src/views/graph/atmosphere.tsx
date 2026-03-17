import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface AtmosphereProps {
    count?: number;
    spread?: number;
}

export function Atmosphere({ count = 1000, spread = 500 }: AtmosphereProps) {
    const pointsRef = useRef<THREE.Points>(null);

    const { positions, velocities } = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            pos[i3] = (Math.random() - 0.5) * spread;
            pos[i3 + 1] = (Math.random() - 0.5) * spread;
            pos[i3 + 2] = (Math.random() - 0.5) * spread;

            vel[i3] = (Math.random() - 0.5) * 0.3;
            vel[i3 + 1] = (Math.random() - 0.5) * 0.3;
            vel[i3 + 2] = (Math.random() - 0.5) * 0.3;
        }

        return { positions: pos, velocities: vel };
    }, [count, spread]);

    useFrame((_, delta) => {
        const pts = pointsRef.current;
        if (!pts) return;

        const posAttr = pts.geometry.attributes.position as THREE.BufferAttribute;
        const pos = posAttr.array as Float32Array;
        const half = spread / 2;

        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            pos[i3] += velocities[i3] * delta;
            pos[i3 + 1] += velocities[i3 + 1] * delta;
            pos[i3 + 2] += velocities[i3 + 2] * delta;

            for (let axis = 0; axis < 3; axis++) {
                if (pos[i3 + axis] > half) {
                    pos[i3 + axis] = half;
                    velocities[i3 + axis] *= -1;
                } else if (pos[i3 + axis] < -half) {
                    pos[i3 + axis] = -half;
                    velocities[i3 + axis] *= -1;
                }
            }
        }

        posAttr.needsUpdate = true;
    });

    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geo;
    }, [positions]);

    useEffect(() => {
        return () => {
            geometry.dispose();
        };
    }, [geometry]);

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial size={0.3} color="#3b4a6b" transparent opacity={0.35} sizeAttenuation />
        </points>
    );
}
