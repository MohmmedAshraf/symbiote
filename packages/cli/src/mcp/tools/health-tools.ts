import type { ServerContext } from '../context.js';
import type { HealthReport } from '../../brain/health.js';

export function handleGetHealth(ctx: ServerContext): HealthReport {
    return ctx.health.analyze();
}
