export const lineVertexShader = `
    attribute float aRatio;
    varying float vRatio;
    void main() {
        vRatio = aRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const lineFragmentShader = `
    uniform vec3 uColor;
    uniform float uProgress;
    uniform float uDecay;
    varying float vRatio;
    void main() {
        float headDist = uProgress - vRatio;
        if (headDist < 0.0 && uProgress <= 1.0) discard;
        float head = exp(-max(headDist, 0.0) * 30.0);
        gl_FragColor = vec4(
            mix(uColor, vec3(1.0), head * 0.95),
            max(head, 0.2) * uDecay
        );
    }
`;

export const outerVertexShader = `
    uniform float uTime;
    uniform float uStress;
    uniform float uConsciousness;
    uniform float uMoodInfluence;
    attribute float aSize;
    attribute vec3 aBaseColor;
    attribute float aStars;
    attribute float aActivation;
    varying vec3 vColor;
    varying float vActivation;
    void main() {
        vec3 newPos = position;
        float wave = sin(position.x * 0.02 + uTime) *
                     cos(position.y * 0.02 + uTime);
        newPos += normalize(position) * wave *
                  (1.5 + uStress * 3.0 + uConsciousness * 2.0 + uMoodInfluence);
        newPos += normalize(position) * aActivation * 5.0;
        vColor = mix(aBaseColor, vec3(1.0), aActivation * 0.5);
        vActivation = aActivation;
        vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
        gl_PointSize = aSize *
            (0.3 + aStars * 0.8 + aActivation * 1.5) *
            (600.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

export const outerFragmentShader = `
    varying vec3 vColor;
    varying float vActivation;
    void main() {
        float r = distance(gl_PointCoord, vec2(0.5));
        if (r > 0.5) discard;
        float strength = exp(-pow(r * 2.5, 2.0) * 4.0);
        gl_FragColor = vec4(
            vColor * (1.0 + vActivation * 2.0),
            strength * (0.5 + vActivation * 1.5)
        );
    }
`;

export const innerVertexShader = `
    #define MAX_RIPPLES 32
    #define MAX_ACTIVE 50
    uniform float uTime;
    uniform float uStress;
    uniform float uConsciousness;
    uniform float uDreaming;
    uniform float uMoodInfluence;
    uniform vec3 uMoodColor;
    uniform vec3 uRipplesPos[MAX_RIPPLES];
    uniform float uRipplesProgress[MAX_RIPPLES];
    uniform vec3 uRipplesColor[MAX_RIPPLES];
    uniform vec3 uLobePos[8];
    uniform float uLobeHypertrophy[8];
    uniform float uLobeMemory[8];
    uniform int uLobeCount;
    uniform vec3 uActiveNeurons[MAX_ACTIVE];
    uniform vec3 uActiveColors[MAX_ACTIVE];
    uniform float uActiveStrength[MAX_ACTIVE];
    uniform int uActiveCount;
    attribute float aSize;
    attribute vec3 aBaseColor;
    attribute float aStars;
    varying vec3 vColor;
    varying float vIntensity;
    void main() {
        vec3 newPos = position;
        float dreamWave = sin(uTime * 2.0 + position.x * 0.1) * uDreaming * 15.0;
        float breath = sin(uTime * 1.5) * (1.0 + aStars * 2.0);
        vec3 accColor = aBaseColor;
        float totalInfluence = 0.0;
        float activationInfluence = 0.0;

        for (int i = 0; i < MAX_RIPPLES; i++) {
            if (uRipplesProgress[i] >= 1.0 || uRipplesProgress[i] <= 0.0) continue;
            float dist = distance(position, uRipplesPos[i]);
            float wave = exp(-pow(dist - uRipplesProgress[i] * 200.0, 2.0) / 200.0)
                         * (1.0 - uRipplesProgress[i]);
            if (wave > 0.01) {
                accColor = mix(accColor, uRipplesColor[i] * 1.8, min(wave, 1.0));
                totalInfluence += wave * 10.0;
            }
        }

        for (int i = 0; i < MAX_ACTIVE; i++) {
            if (i >= uActiveCount) break;
            float dist = distance(position, uActiveNeurons[i]);
            float influence = exp(-pow(dist * 0.015, 2.0)) * uActiveStrength[i];
            if (influence > 0.01) {
                accColor = mix(accColor, uActiveColors[i] * 2.0, influence * 0.6);
                activationInfluence += influence * 15.0;
            }
        }

        float totalHypertrophy = 0.0;
        float totalMemory = 0.0;
        for (int i = 0; i < 8; i++) {
            if (i >= uLobeCount) break;
            float d = distance(position, uLobePos[i]);
            float influence = exp(-pow(d * 0.025, 2.0));
            totalHypertrophy += influence * uLobeHypertrophy[i] * 40.0;
            totalMemory += influence * uLobeMemory[i] * 20.0;
        }

        float displacement = breath + totalInfluence + totalHypertrophy +
                             totalMemory + uStress * 2.0 + dreamWave +
                             activationInfluence;
        newPos += normalize(position) * clamp(displacement, -80.0, 80.0);

        vColor = mix(
            accColor,
            mix(vec3(1.0, 0.8, 1.0), uMoodColor, 0.5),
            uConsciousness * 0.3 + uMoodInfluence * 0.2
        );
        vIntensity = 1.0 + aStars * 2.5 + totalInfluence * 4.0 +
                     totalHypertrophy * 2.5 + totalMemory * 1.5 +
                     uConsciousness * 2.0 + uMoodInfluence * 1.0 +
                     activationInfluence * 3.0;

        vec4 mvPos = modelViewMatrix * vec4(newPos, 1.0);
        gl_PointSize = aSize * (700.0 / -mvPos.z) *
            (1.0 + totalInfluence * 0.15 + totalHypertrophy * 0.2 +
             uConsciousness * 0.1 + activationInfluence * 0.3);
        gl_Position = projectionMatrix * mvPos;
    }
`;

export const innerFragmentShader = `
    uniform float uTime;
    uniform float uStress;
    uniform float uConsciousness;
    uniform float uDreaming;
    uniform float uMoodInfluence;
    varying vec3 vColor;
    varying float vIntensity;
    void main() {
        float r = distance(gl_PointCoord, vec2(0.5));
        if (r > 0.5) discard;
        float str = exp(-pow(r * 2.5, 2.0) * 4.0);
        float pulse = 1.0 + sin(uTime * 2.5 + uStress) * 0.2;
        float dreamPulse = 1.0 + sin(uTime * 1.5) * uDreaming * 0.5;
        float consciousGlow = 1.0 + uConsciousness * 3.0;
        float moodPulse = 1.0 + sin(uTime * 1.2) * uMoodInfluence * 0.3;
        gl_FragColor = vec4(
            vColor * vIntensity * pulse * dreamPulse * consciousGlow * moodPulse,
            str * 1.3
        );
    }
`;

export const ringVertexShader = `
    uniform float uRadius;
    uniform float uOpacity;
    attribute vec3 color;
    varying vec3 vColor;
    void main() {
        vColor = color;
        vec3 scaled = position * uRadius;
        vec4 mvPos = modelViewMatrix * vec4(scaled, 1.0);
        gl_PointSize = (3.5 + uRadius * 0.04) * (500.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
    }
`;

export const ringFragmentShader = `
    uniform float uOpacity;
    varying vec3 vColor;
    void main() {
        float r = distance(gl_PointCoord, vec2(0.5));
        if (r > 0.5) discard;
        float glow = exp(-pow(r * 2.2, 2.0) * 3.5);
        gl_FragColor = vec4(vColor * (1.5 + glow), glow * uOpacity);
    }
`;
