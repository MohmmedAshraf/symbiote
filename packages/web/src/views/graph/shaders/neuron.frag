uniform float uTime;
uniform vec3 uClusterColors[20];
uniform float uDimAmount;

varying float vCluster;
varying float vPagerank;
varying float vCentrality;
varying float vPulse;
varying float vFiring;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
    int idx = int(vCluster);
    vec3 baseColor = uClusterColors[idx];

    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diff = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.3;
    vec3 lit = baseColor * (ambient + diff * 0.5);

    float emissiveBase = 0.2 + vPagerank * 1.5;
    float emissivePulse = emissiveBase * vPulse;
    float emissiveFire = vFiring * 3.0;
    float emissive = emissivePulse + emissiveFire;

    vec3 glow = baseColor * emissive;

    float rim = 1.0 - max(dot(vNormal, normalize(-vWorldPos)), 0.0);
    rim = pow(rim, 2.5);
    vec3 rimGlow = baseColor * rim * 0.6;

    float opacity = 0.5 + vCentrality * 0.5;
    opacity = clamp(opacity, 0.3, 1.0);
    opacity *= (1.0 - uDimAmount);

    vec3 finalColor = lit + glow + rimGlow;

    gl_FragColor = vec4(finalColor, opacity);
}
