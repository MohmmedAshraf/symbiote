import type { CortexRepository } from '#cortex/repository.js';
import type {
    Finding,
    FindingKind,
    FindingSeverity,
    ArchitectureOverview,
    ToolResponse,
} from '#cortex/types.js';

export interface FindPatternsInput {
    scope: string;
    kinds?: FindingKind[];
    severity?: FindingSeverity;
}

export interface FindPatternsOutput {
    findings: Finding[];
    scope: string;
    totalCount: number;
}

export async function handleFindPatterns(
    repo: CortexRepository,
    input: FindPatternsInput,
): Promise<ToolResponse<FindPatternsOutput>> {
    const raw = await repo.getMeta('findings');
    const maxDepth = await repo.getMaxDepthLevel();
    let findings: Finding[] = raw ? JSON.parse(raw) : [];

    if (input.scope !== 'all') {
        findings = findings.filter((f) => f.filePaths.some((fp) => fp.includes(input.scope)));
    }

    if (input.kinds?.length) {
        const kindSet = new Set(input.kinds);
        findings = findings.filter((f) => kindSet.has(f.kind));
    }

    if (input.severity) {
        const severityOrder: Record<FindingSeverity, number> = {
            info: 0,
            warning: 1,
            error: 2,
        };
        const minSeverity = severityOrder[input.severity];
        findings = findings.filter((f) => severityOrder[f.severity] >= minSeverity);
    }

    return {
        data: {
            findings,
            scope: input.scope,
            totalCount: findings.length,
        },
        depth: maxDepth,
        deepening: maxDepth < 7,
    };
}

export async function handleGetArchitecture(
    repo: CortexRepository,
): Promise<ToolResponse<ArchitectureOverview>> {
    const layersRaw = await repo.getMeta('layers');
    const layers = layersRaw ? JSON.parse(layersRaw) : [];

    const boundariesRaw = await repo.getMeta('layer_boundaries');
    const boundaries = boundariesRaw ? JSON.parse(boundariesRaw) : [];

    const findingsRaw = await repo.getMeta('findings');
    const allFindings: Finding[] = findingsRaw ? JSON.parse(findingsRaw) : [];
    const violations = allFindings.filter(
        (f) => f.kind === 'layer_violation' || f.kind === 'dependency_direction',
    );

    const communityCountRaw = await repo.getMeta('community_count');
    const communityCount = communityCountRaw ? parseInt(communityCountRaw, 10) : 0;

    const topHubsRaw = await repo.getMeta('top_hubs');
    const topHubs = topHubsRaw ? JSON.parse(topHubsRaw) : [];

    const maxDepth = await repo.getMaxDepthLevel();

    return {
        data: {
            layers,
            boundaries,
            violations,
            communityCount,
            topHubs,
        },
        depth: maxDepth,
        deepening: maxDepth < 7,
    };
}
