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

export async function getMaxDepth(repo: CortexRepository): Promise<number> {
    const files = await repo.getAllFileNodes();
    if (files.length === 0) return 0;
    return Math.min(...files.map((f) => f.depthLevel));
}

export async function getDepthForFile(repo: CortexRepository, filePath: string): Promise<number> {
    const fileId = `file:${filePath}`;
    const file = await repo.getFileNode(fileId);
    return file?.depthLevel ?? 0;
}
