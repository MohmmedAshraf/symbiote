import fs from 'node:fs';
import path from 'node:path';

export type IntentType = 'decision' | 'constraint';
export type IntentStatus = 'active' | 'proposed' | 'rejected' | 'superseded';

export interface IntentFrontmatter {
    id: string;
    type: IntentType;
    scope: string;
    status: IntentStatus;
    author: string;
    createdAt: string;
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

    listEntries(
        type: IntentType,
        options?: ListIntentOptions
    ): IntentEntry[] {
        const dir = this.typeDir(type);
        if (!fs.existsSync(dir)) return [];

        const files = fs
            .readdirSync(dir)
            .filter((f) => f.endsWith('.md'));
        const entries: IntentEntry[] = [];

        for (const file of files) {
            const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
            const parsed = parseIntentFrontmatter(raw);
            if (!parsed) continue;

            if (
                options?.status &&
                parsed.frontmatter.status !== options.status
            )
                continue;
            if (
                options?.scope &&
                parsed.frontmatter.scope !== options.scope
            )
                continue;

            entries.push(parsed);
        }

        return entries;
    }

    readEntry(id: string): IntentEntry | null {
        for (const type of ['decision', 'constraint'] as IntentType[]) {
            const dir = this.typeDir(type);
            if (!fs.existsSync(dir)) continue;

            const files = fs
                .readdirSync(dir)
                .filter((f) => f.endsWith('.md'));

            for (const file of files) {
                const raw = fs.readFileSync(
                    path.join(dir, file),
                    'utf-8'
                );
                const parsed = parseIntentFrontmatter(raw);
                if (parsed && parsed.frontmatter.id === id)
                    return parsed;
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
        return path.join(
            this.intentDir,
            type === 'decision' ? 'decisions' : 'constraints'
        );
    }

    private idToFileName(id: string): string {
        return id.replace(/^(decision-|constraint-)/, '') + '.md';
    }
}

export function parseIntentFrontmatter(
    raw: string
): IntentEntry | null {
    if (!raw || !raw.startsWith('---')) return null;

    const endIndex = raw.indexOf('---', 3);
    if (endIndex === -1) return null;

    const block = raw.slice(3, endIndex).trim();
    const content = raw.slice(endIndex + 3).trim();

    const fields = parseSimpleYaml(block);
    if (!fields || !fields.id || !fields.type) return null;

    return {
        frontmatter: {
            id: String(fields.id),
            type: fields.type as IntentType,
            scope: String(fields.scope ?? 'global'),
            status: (fields.status as IntentStatus) ?? 'active',
            author: String(fields.author ?? 'unknown'),
            createdAt: stripQuotes(
                String(
                    fields.createdAt ??
                        new Date().toISOString().split('T')[0]
                )
            ),
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
        '---',
        '',
        entry.content,
        '',
    ];
    return lines.join('\n');
}

function stripQuotes(s: string): string {
    if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
    ) {
        return s.slice(1, -1);
    }
    return s;
}

function parseSimpleYaml(
    block: string
): Record<string, string> | null {
    const result: Record<string, string> = {};
    const lines = block.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) continue;

        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        result[key] = stripQuotes(value);
    }

    return Object.keys(result).length > 0 ? result : null;
}
