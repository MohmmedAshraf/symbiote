import type { DeadCodeEntry } from './types.js';
import type { PreFetchedData } from './cycle-detector.js';

const TRACKABLE_KINDS = new Set(['function', 'class']);

const ENTRY_POINT_NAMES = new Set(['main', 'cli', 'handler', 'run', 'start', 'app', 'server']);

function isReactComponent(node: { name: string; filePath: string }): boolean {
    return /\.tsx$/.test(node.filePath) && /^[A-Z]/.test(node.name);
}

export class DeadCodeDetector {
    async detect(preFetched: PreFetchedData): Promise<DeadCodeEntry[]> {
        const { nodes: allNodes, edges: allEdges } = preFetched;
        if (allNodes.length === 0) return [];

        const productionInbound = new Set<string>();
        const callerMap = new Map<string, Set<string>>();

        for (const edge of allEdges) {
            if (edge.type === 'contains') continue;

            productionInbound.add(edge.targetId);

            let callers = callerMap.get(edge.targetId);
            if (!callers) {
                callers = new Set();
                callerMap.set(edge.targetId, callers);
            }
            callers.add(edge.sourceId);
        }

        const deadSet = new Set<string>();
        const dead: DeadCodeEntry[] = [];

        for (const node of allNodes) {
            if (!TRACKABLE_KINDS.has(node.type)) continue;
            if (productionInbound.has(node.id)) continue;
            if (ENTRY_POINT_NAMES.has(node.name)) continue;
            if (node.isExported) continue;
            if (isReactComponent(node)) continue;

            deadSet.add(node.id);
            dead.push({ node, reason: 'No dependents found' });
        }

        let changed = true;
        while (changed) {
            changed = false;
            for (const node of allNodes) {
                if (!TRACKABLE_KINDS.has(node.type)) continue;
                if (deadSet.has(node.id)) continue;
                if (ENTRY_POINT_NAMES.has(node.name)) continue;
                if (node.isExported) continue;
                if (isReactComponent(node)) continue;

                const callers = callerMap.get(node.id);
                if (!callers) continue;

                const allCallersDead = [...callers].every((cid) => deadSet.has(cid));
                if (!allCallersDead) continue;

                deadSet.add(node.id);
                dead.push({ node, reason: 'Only referenced by dead code' });
                changed = true;
            }
        }

        return dead;
    }
}
