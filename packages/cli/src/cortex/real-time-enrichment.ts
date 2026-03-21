import type { AttentionWeight, InvestigationContext } from './topology-types.js';

interface EditResult {
    filePath: string;
    needsReanalysis: boolean;
}

const MAX_WEIGHT = 1.0;
const READ_BOOST = 0.1;
const EDIT_BOOST = 0.3;
const DECAY_RATE = 0.05;
const MAX_RECENT_FILES = 20;

export class RealTimeEnrichment {
    private weights = new Map<string, AttentionWeight>();
    private recentFiles: string[] = [];
    private editedFiles = new Set<string>();
    private editBoostActive = new Set<string>();

    onFileRead(filePath: string, nodeIds: string[]): void {
        const idx = this.recentFiles.indexOf(filePath);
        if (idx !== -1) this.recentFiles.splice(idx, 1);
        this.recentFiles.unshift(filePath);
        if (this.recentFiles.length > MAX_RECENT_FILES) {
            this.recentFiles = this.recentFiles.slice(0, MAX_RECENT_FILES);
        }

        const boost = this.editBoostActive.has(filePath) ? READ_BOOST + EDIT_BOOST : READ_BOOST;

        for (const nodeId of nodeIds) {
            const existing = this.weights.get(nodeId);
            if (existing) {
                existing.weight = Math.min(MAX_WEIGHT, existing.weight + boost);
                existing.lastAccessed = Date.now();
            } else {
                this.weights.set(nodeId, {
                    nodeId,
                    weight: Math.min(MAX_WEIGHT, boost),
                    lastAccessed: Date.now(),
                    decayRate: DECAY_RATE,
                });
            }
        }
    }

    onFileEdit(filePath: string): EditResult {
        this.editedFiles.add(filePath);
        this.editBoostActive.add(filePath);
        return { filePath, needsReanalysis: true };
    }

    getAttentionWeight(nodeId: string): number {
        return this.weights.get(nodeId)?.weight ?? 0;
    }

    getTopAttentionNodes(limit: number): AttentionWeight[] {
        const sorted = [...this.weights.values()].sort((a, b) => b.weight - a.weight);
        return sorted.slice(0, limit);
    }

    getInvestigationContext(): InvestigationContext {
        const dirCounts = new Map<string, number>();
        for (const file of this.recentFiles) {
            const parts = file.split('/');
            for (let i = 1; i < parts.length; i++) {
                const dir = parts.slice(0, i).join('/');
                dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
            }
        }

        const inferredScope: string[] = [];
        const threshold = Math.max(2, Math.floor(this.recentFiles.length * 0.5));
        for (const [dir, count] of dirCounts) {
            if (count >= threshold) {
                inferredScope.push(dir);
            }
        }

        inferredScope.sort((a, b) => b.length - a.length);

        const filtered: string[] = [];
        for (const dir of inferredScope) {
            const isParent = filtered.some((f) => f.startsWith(dir + '/'));
            if (!isParent) filtered.push(dir);
        }

        return {
            recentFiles: [...this.recentFiles],
            inferredScope: filtered,
            communityIds: [],
        };
    }

    tick(): void {
        const toDelete: string[] = [];
        for (const [nodeId, weight] of this.weights) {
            weight.weight -= weight.decayRate;
            if (weight.weight <= 0.01) {
                toDelete.push(nodeId);
            }
        }
        for (const nodeId of toDelete) {
            this.weights.delete(nodeId);
            this.editBoostActive.delete(nodeId);
        }
    }

    dispose(): void {
        this.weights.clear();
        this.recentFiles = [];
        this.editedFiles.clear();
        this.editBoostActive.clear();
    }
}
