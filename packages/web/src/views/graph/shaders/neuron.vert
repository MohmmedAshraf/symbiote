uniform float uTime;
uniform float uSelectedIndex;

attribute float aCluster;
attribute float aPagerank;
attribute float aCentrality;
attribute float aPhase;
attribute float aFiring;

varying float vCluster;
varying float vPagerank;
varying float vCentrality;
varying float vPulse;
varying float vFiring;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
    vCluster = aCluster;
    vPagerank = aPagerank;
    vCentrality = aCentrality;
    vFiring = aFiring;
    vNormal = normalize(normalMatrix * normal);

    float baseSize = 0.8 + aPagerank * 12.0;
    float pulse = sin(uTime * 1.5 + aPhase * 6.2831) * 0.08 + 1.0;
    float fireScale = 1.0 + aFiring * 0.4;
    vPulse = pulse;

    vec3 scaled = position * baseSize * pulse * fireScale;

    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(scaled, 1.0);
    vWorldPos = (instanceMatrix * vec4(scaled, 1.0)).xyz;

    gl_Position = projectionMatrix * mvPosition;
}
