import path from 'node:path';

export interface AttentionEntry {
    lastAccess: number;
    accessCount: number;
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

    touchFile(filePath: string): void {
        const entry = this.files.get(filePath);
        if (entry) {
            entry.lastAccess = this.tickCount;
            entry.accessCount += 1;
        } else {
            this.files.set(filePath, { lastAccess: this.tickCount, accessCount: 1 });
        }
    }

    touchSymbol(symbolId: string): void {
        const entry = this.symbols.get(symbolId);
        if (entry) {
            entry.lastAccess = this.tickCount;
            entry.accessCount += 1;
        } else {
            this.symbols.set(symbolId, { lastAccess: this.tickCount, accessCount: 1 });
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
            filesModified: this.allFiles(),
            symbolsChanged: this.allSymbols(),
            activeAttention: this.activeDirectory(),
        };
    }

    clear(): void {
        this.files.clear();
        this.symbols.clear();
        this.tickCount = 0;
    }
}
