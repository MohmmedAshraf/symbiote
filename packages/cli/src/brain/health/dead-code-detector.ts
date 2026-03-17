import type { Repository } from '../../storage/repository.js';
import type { DeadCodeEntry } from './types.js';
import type { PreFetchedData } from './cycle-detector.js';

const ENTRY_POINT_PATTERNS = [
    /^index\.[jt]sx?$/,
    /^main\.[jt]sx?$/,
    /^app\.[jt]sx?$/,
    /^server\.[jt]sx?$/,
    /^cli\.[jt]sx?$/,
];

export class DeadCodeDetector {
    constructor(private repo: Repository) {}

    async detect(preFetched?: PreFetchedData): Promise<DeadCodeEntry[]> {
        const allNodes = preFetched?.nodes ?? (await this.repo.getAllNodes());
        if (allNodes.length === 0) return [];

        const allEdges = preFetched?.edges ?? (await this.repo.getAllEdges());
        const referencedIds = new Set<string>();

        for (const edge of allEdges) {
            referencedIds.add(edge.targetId);
        }

        const dead: DeadCodeEntry[] = [];

        for (const node of allNodes) {
            if (node.type !== 'function' && node.type !== 'class' && node.type !== 'method') {
                continue;
            }

            if (referencedIds.has(node.id)) continue;
            if (this.isEntryPointFile(node.filePath)) continue;

            dead.push({ node, reason: 'No dependents found' });
        }

        return dead;
    }

    private isEntryPointFile(filePath: string): boolean {
        const fileName = filePath.split('/').pop() ?? '';
        return ENTRY_POINT_PATTERNS.some((pattern) => pattern.test(fileName));
    }
}
