import type { ServerContext } from '../context.js';
import type { HealthReport } from '../../brain/health/index.js';

export function handleGetHealth(ctx: ServerContext): HealthReport {
    const report = ctx.health.analyze();
    ctx.health.saveSnapshot(report);
    return report;
}
