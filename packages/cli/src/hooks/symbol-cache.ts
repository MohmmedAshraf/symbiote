export interface SymbolCacheEntry {
    filePath: string;
    line: number;
    kind: string;
}

export class SymbolCache {
    private cache = new Map<string, SymbolCacheEntry>();

    get(name: string): SymbolCacheEntry | undefined {
        return this.cache.get(name);
    }

    set(name: string, entry: SymbolCacheEntry): void {
        this.cache.set(name, entry);
    }

    rebuild(nodes: { name: string; filePath: string; lineStart: number; kind: string }[]): void {
        this.cache.clear();
        for (const node of nodes) {
            this.cache.set(node.name, {
                filePath: node.filePath,
                line: node.lineStart,
                kind: node.kind,
            });
        }
    }

    has(name: string): boolean {
        return this.cache.has(name);
    }
}
