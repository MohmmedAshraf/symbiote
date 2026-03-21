import type { ServerContext } from '../context.js';
import type { HealthReport } from '#brain/health/index.js';
import type { ToolResponse } from '#cortex/types.js';
import { wrapResponse, getMinDepthLevel } from '../tool-response.js';

export async function handleGetHealth(ctx: ServerContext): Promise<ToolResponse<HealthReport>> {
    const report = await ctx.health.analyze();
    const depth = await getMinDepthLevel(ctx.cortexRepo);
    return wrapResponse(report, depth, false);
}
