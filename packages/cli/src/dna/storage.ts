import fs from 'node:fs';
import path from 'node:path';
import {
    DNA_CATEGORIES,
    parseFrontmatter,
    serializeEntry,
    type DnaCategory,
    type DnaEntry,
    type DnaIndex,
    type DnaIndexEntry,
    type DnaStatus,
} from './types.js';

export interface ListOptions {
    status?: DnaStatus;
    category?: DnaCategory;
}

export class DnaStorage {
    constructor(private dnaDir: string) {}

    ensureDirectories(): void {
        for (const category of DNA_CATEGORIES) {
            fs.mkdirSync(path.join(this.dnaDir, category), {
                recursive: true,
            });
        }

        const indexPath = path.join(this.dnaDir, 'index.json');
        if (!fs.existsSync(indexPath)) {
            this.writeIndex({ version: 1, entries: [] });
        }
    }

    readIndex(): DnaIndex {
        const indexPath = path.join(this.dnaDir, 'index.json');
        const raw = fs.readFileSync(indexPath, 'utf-8');
        return JSON.parse(raw) as DnaIndex;
    }

    readEntry(id: string): DnaEntry | null {
        const index = this.readIndex();
        const indexEntry = index.entries.find((e) => e.id === id);
        if (!indexEntry) return null;

        const filePath = path.join(this.dnaDir, indexEntry.category, indexEntry.fileName);

        if (!fs.existsSync(filePath)) return null;

        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseFrontmatter(raw);
        if (!parsed) return null;

        return { frontmatter: parsed.frontmatter, content: parsed.content };
    }

    writeEntry(entry: DnaEntry): void {
        const fm = entry.frontmatter;
        const fileName = this.idToFileName(fm.id, fm.category);
        const filePath = path.join(this.dnaDir, fm.category, fileName);

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, serializeEntry(entry));

        const index = this.readIndex();
        const existingIdx = index.entries.findIndex((e) => e.id === fm.id);

        const indexEntry: DnaIndexEntry = {
            id: fm.id,
            category: fm.category,
            status: fm.status,
            confidence: fm.confidence,
            fileName,
        };

        if (existingIdx >= 0) {
            index.entries[existingIdx] = indexEntry;
        } else {
            index.entries.push(indexEntry);
        }

        this.writeIndex(index);
    }

    deleteEntry(id: string): void {
        const index = this.readIndex();
        const indexEntry = index.entries.find((e) => e.id === id);
        if (!indexEntry) return;

        const filePath = path.join(this.dnaDir, indexEntry.category, indexEntry.fileName);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        index.entries = index.entries.filter((e) => e.id !== id);
        this.writeIndex(index);
    }

    listEntries(options?: ListOptions): DnaEntry[] {
        const index = this.readIndex();
        let filtered = index.entries;

        if (options?.status) {
            filtered = filtered.filter((e) => e.status === options.status);
        }

        if (options?.category) {
            filtered = filtered.filter((e) => e.category === options.category);
        }

        const entries: DnaEntry[] = [];
        for (const indexEntry of filtered) {
            const entry = this.readEntry(indexEntry.id);
            if (entry) entries.push(entry);
        }

        return entries;
    }

    private writeIndex(index: DnaIndex): void {
        const indexPath = path.join(this.dnaDir, 'index.json');
        const tmpPath = indexPath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(index, null, 4) + '\n');
        fs.renameSync(tmpPath, indexPath);
    }

    private idToFileName(id: string, category: DnaCategory): string {
        const prefix = `${category}-`;
        const name = id.startsWith(prefix) ? id.slice(prefix.length) : id;
        return `${name}.md`;
    }
}
