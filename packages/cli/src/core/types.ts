import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GraphConstructor = require('graphology');

export type GraphInstance = InstanceType<typeof GraphConstructor>;
export { GraphConstructor as Graph };

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export function computeRiskLevel(maxConfidence: number): RiskLevel {
    if (maxConfidence > 0.7) return 'HIGH';
    if (maxConfidence > 0.4) return 'MEDIUM';
    return 'LOW';
}
