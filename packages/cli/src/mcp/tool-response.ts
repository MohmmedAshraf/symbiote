import type { ToolResponse } from '#cortex/types.js';
import type { CortexRepository } from '#cortex/repository.js';

export function wrapResponse<T>(
    data: T,
    depth: number,
    deepening: boolean,
    staleSince?: string,
): ToolResponse<T> {
    const response: ToolResponse<T> = { data, depth, deepening };
    if (staleSince !== undefined) {
        response.stale_since = staleSince;
    }
    return response;
}

export async function getMinDepthLevel(repo: CortexRepository): Promise<number> {
    const files = await repo.getAllFileNodes();
    if (files.length === 0) return 0;
    return files.reduce((min, f) => Math.min(min, f.depthLevel), Infinity);
}

/** @deprecated Use getMinDepthLevel instead */
export const getMaxDepth = getMinDepthLevel;
