import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseYamlBlock } from '../dna/types.js';

export type IntentType = 'decision' | 'constraint';
export type IntentStatus = 'active' | 'proposed' | 'rejected' | 'superseded';

export interface IntentFrontmatter {
    id: string;
    type: IntentType;
    scope: string;
    status: IntentStatus;
    author: string;
    createdAt: string;
    pattern?: string;
}

export interface IntentEntry {
    frontmatter: IntentFrontmatter;
    content: string;
}

export interface ListIntentOptions {
    scope?: string;
    status?: IntentStatus;
}

export class IntentStore {
    private intentDir: string;

    constructor(brainDir: string) {
        this.intentDir = path.join(brainDir, 'intent');
    }

    async listEntries(type: IntentType, options?: ListIntentOptions): Promise<IntentEntry[]> {
        const dir = this.typeDir(type);
        if (!fs.existsSync(dir)) return [];

        const allFiles = await fsp.readdir(dir);
        const files = allFiles.filter((f) => f.endsWith('.md'));
        const entries: IntentEntry[] = [];

        const reads = files.map((file) => fsp.readFile(path.join(dir, file), 'utf-8'));
        const contents = await Promise.all(reads);

        for (const raw of contents) {
            const parsed = parseIntentFrontmatter(raw);
            if (!parsed) continue;

            if (options?.status && parsed.frontmatter.status !== options.status) continue;
            if (options?.scope && parsed.frontmatter.scope !== options.scope) continue;

            entries.push(parsed);
        }

        return entries;
    }

    async readEntry(id: string): Promise<IntentEntry | null> {
        for (const type of ['decision', 'constraint'] as IntentType[]) {
            const dir = this.typeDir(type);
            if (!fs.existsSync(dir)) continue;

            const allFiles = await fsp.readdir(dir);
            const files = allFiles.filter((f) => f.endsWith('.md'));

            const reads = files.map((file) => fsp.readFile(path.join(dir, file), 'utf-8'));
            const contents = await Promise.all(reads);

            for (const raw of contents) {
                const parsed = parseIntentFrontmatter(raw);
                if (parsed && parsed.frontmatter.id === id) return parsed;
            }
        }

        return null;
    }

    writeEntry(entry: IntentEntry): void {
        const dir = this.typeDir(entry.frontmatter.type);
        fs.mkdirSync(dir, { recursive: true });

        const fileName = this.idToFileName(entry.frontmatter.id);
        const filePath = path.join(dir, fileName);

        fs.writeFileSync(filePath, serializeIntentEntry(entry));
    }

    private typeDir(type: IntentType): string {
        return path.join(this.intentDir, type === 'decision' ? 'decisions' : 'constraints');
    }

    private idToFileName(id: string): string {
        return id.replace(/^(decision-|constraint-)/, '') + '.md';
    }
}

export function parseIntentFrontmatter(raw: string): IntentEntry | null {
    if (!raw || !raw.startsWith('---')) return null;

    const endIndex = raw.indexOf('---', 3);
    if (endIndex === -1) return null;

    const block = raw.slice(3, endIndex).trim();
    const content = raw.slice(endIndex + 3).trim();

    const fields = parseYamlBlock(block);
    if (!fields || !fields.id || !fields.type) return null;

    const validTypes: IntentType[] = ['decision', 'constraint'];
    const validStatuses: IntentStatus[] = ['active', 'proposed', 'rejected', 'superseded'];

    const type = String(fields.type);
    if (!validTypes.includes(type as IntentType)) return null;

    const rawStatus = String(fields.status ?? 'active');
    const status = validStatuses.includes(rawStatus as IntentStatus)
        ? (rawStatus as IntentStatus)
        : 'active';

    return {
        frontmatter: {
            id: String(fields.id),
            type: type as IntentType,
            scope: String(fields.scope ?? 'global'),
            status,
            author: String(fields.author ?? 'unknown'),
            createdAt: stripQuotes(
                String(fields.createdAt ?? new Date().toISOString().split('T')[0]),
            ),
            pattern: fields.pattern
                ? stripQuotes(String(fields.pattern)).replace(/\\"/g, '"')
                : undefined,
        },
        content,
    };
}

export function serializeIntentEntry(entry: IntentEntry): string {
    const fm = entry.frontmatter;
    const lines = [
        '---',
        `id: ${fm.id}`,
        `type: ${fm.type}`,
        `scope: ${fm.scope}`,
        `status: ${fm.status}`,
        `author: ${fm.author}`,
        `createdAt: "${fm.createdAt}"`,
    ];
    if (fm.pattern) {
        lines.push(`pattern: "${fm.pattern}"`);
    }
    lines.push('---', '', entry.content, '');
    return lines.join('\n');
}

function stripQuotes(s: string): string {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    return s;
}
