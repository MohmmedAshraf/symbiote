import path from 'node:path';

export type AttentionMode = 'read' | 'edit';

export interface AttentionEntry {
    lastAccess: number;
    accessCount: number;
    mode: AttentionMode;
    deliveredContext: Set<string>;
    communityId?: number;
}

export interface AttentionSnapshot {
    filesModified: string[];
    symbolsChanged: string[];
    activeAttention: string;
}

const DECAY_THRESHOLD = 50;

export class AttentionSet {
    private files: Map<string, AttentionEntry> = new Map();
    private symbols: Map<string, AttentionEntry> = new Map();
    private tickCount: number = 0;
    private discoveryCount: number = 0;

    touchFile(filePath: string, mode: AttentionMode = 'read', communityId?: number): void {
        const entry = this.files.get(filePath);
        if (entry) {
            entry.lastAccess = this.tickCount;
            entry.accessCount += 1;
            if (mode === 'edit') entry.mode = 'edit';
            if (communityId !== undefined) entry.communityId = communityId;
        } else {
            this.discoveryCount++;
            this.files.set(filePath, {
                lastAccess: this.tickCount,
                accessCount: 1,
                mode,
                deliveredContext: new Set(),
                communityId,
            });
        }
    }

    touchSymbol(symbolId: string, mode: AttentionMode = 'read'): void {
        const entry = this.symbols.get(symbolId);
        if (entry) {
            entry.lastAccess = this.tickCount;
            entry.accessCount += 1;
            if (mode === 'edit') entry.mode = 'edit';
        } else {
            this.symbols.set(symbolId, {
                lastAccess: this.tickCount,
                accessCount: 1,
                mode,
                deliveredContext: new Set(),
            });
        }
    }

    getFile(filePath: string): AttentionEntry | undefined {
        return this.files.get(filePath);
    }

    getSymbol(symbolId: string): AttentionEntry | undefined {
        return this.symbols.get(symbolId);
    }

    tick(): void {
        this.tickCount += 1;
        for (const [key, entry] of this.files) {
            if (this.tickCount - entry.lastAccess > DECAY_THRESHOLD) {
                this.files.delete(key);
            }
        }
        for (const [key, entry] of this.symbols) {
            if (this.tickCount - entry.lastAccess > DECAY_THRESHOLD) {
                this.symbols.delete(key);
            }
        }
    }

    topFiles(n: number): string[] {
        return Array.from(this.files.entries())
            .sort((a, b) => b[1].accessCount - a[1].accessCount)
            .slice(0, n)
            .map(([filePath]) => filePath);
    }

    activeDirectory(): string {
        if (this.files.size === 0) {
            return '';
        }
        const counts = new Map<string, number>();
        for (const filePath of this.files.keys()) {
            const dir = path.dirname(filePath) + '/';
            counts.set(dir, (counts.get(dir) ?? 0) + 1);
        }
        let best = '';
        let bestCount = 0;
        for (const [dir, count] of counts) {
            if (count > bestCount) {
                bestCount = count;
                best = dir;
            }
        }
        return best;
    }

    allFiles(): string[] {
        return Array.from(this.files.keys());
    }

    allSymbols(): string[] {
        return Array.from(this.symbols.keys());
    }

    toSnapshot(): AttentionSnapshot {
        return {
            filesModified: this.editedFiles(),
            symbolsChanged: this.allSymbols(),
            activeAttention: this.activeDirectory(),
        };
    }

    readFiles(): string[] {
        return Array.from(this.files.entries())
            .filter(([, e]) => e.mode === 'read')
            .map(([fp]) => fp);
    }

    editedFiles(): string[] {
        return Array.from(this.files.entries())
            .filter(([, e]) => e.mode === 'edit')
            .map(([fp]) => fp);
    }

    hasDelivered(filePath: string, contextKey: string): boolean {
        return this.files.get(filePath)?.deliveredContext.has(contextKey) ?? false;
    }

    markDelivered(filePath: string, contextKey: string): void {
        this.files.get(filePath)?.deliveredContext.add(contextKey);
    }

    getCommunityId(filePath: string): number | undefined {
        return this.files.get(filePath)?.communityId;
    }

    activeCluster(): { communityId: number; filesRead: number } | null {
        const counts = new Map<number, number>();
        for (const entry of this.files.values()) {
            if (entry.communityId !== undefined) {
                counts.set(entry.communityId, (counts.get(entry.communityId) ?? 0) + 1);
            }
        }
        let best: { communityId: number; filesRead: number } | null = null;
        for (const [communityId, filesRead] of counts) {
            if (filesRead >= 3 && (best === null || filesRead > best.filesRead)) {
                best = { communityId, filesRead };
            }
        }
        return best;
    }

    getDiscoveries(): number {
        return this.discoveryCount;
    }

    clear(): void {
        this.files.clear();
        this.symbols.clear();
        this.tickCount = 0;
        this.discoveryCount = 0;
    }
}
