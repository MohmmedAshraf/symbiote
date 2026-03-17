import type { ServerContext } from '../context.js';
import type { HealthReport } from '../../brain/health/index.js';

export async function handleGetHealth(ctx: ServerContext): Promise<HealthReport> {
    return ctx.health.analyze();
}
