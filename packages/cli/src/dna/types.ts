export const DNA_CATEGORIES = [
    'style',
    'preferences',
    'anti-patterns',
    'decisions',
] as const;

export type DnaCategory = (typeof DNA_CATEGORIES)[number];

export const DNA_STATUSES = ['suggested', 'approved', 'rejected'] as const;

export type DnaStatus = (typeof DNA_STATUSES)[number];

export type DnaSource = 'correction' | 'explicit' | 'pattern';

export interface DnaFrontmatter {
    id: string;
    confidence: number;
    source: DnaSource;
    status: DnaStatus;
    category: DnaCategory;
    firstSeen: string;
    lastSeen: string;
    occurrences: number;
    sessionIds: string[];
}

export interface DnaEntry {
    frontmatter: DnaFrontmatter;
    content: string;
}

export interface DnaIndexEntry {
    id: string;
    category: DnaCategory;
    status: DnaStatus;
    confidence: number;
    fileName: string;
}

export interface DnaIndex {
    version: number;
    entries: DnaIndexEntry[];
}

export function parseFrontmatter(
    raw: string
): { frontmatter: DnaFrontmatter; content: string } | null {
    if (!raw || !raw.startsWith('---')) return null;

    const endIndex = raw.indexOf('---', 3);
    if (endIndex === -1) return null;

    const frontmatterBlock = raw.slice(3, endIndex).trim();
    const content = raw.slice(endIndex + 3).trim();

    const frontmatter = parseYamlBlock(frontmatterBlock);
    if (!frontmatter || !frontmatter.id) return null;

    return {
        frontmatter: {
            id: String(frontmatter.id),
            confidence: Number(frontmatter.confidence ?? 0.3),
            source: (frontmatter.source as DnaSource) ?? 'correction',
            status: (frontmatter.status as DnaStatus) ?? 'suggested',
            category: (frontmatter.category as DnaCategory) ?? 'style',
            firstSeen: stripQuotes(
                String(
                    frontmatter.firstSeen ??
                        new Date().toISOString().split('T')[0]
                )
            ),
            lastSeen: stripQuotes(
                String(
                    frontmatter.lastSeen ??
                        new Date().toISOString().split('T')[0]
                )
            ),
            occurrences: Number(frontmatter.occurrences ?? 1),
            sessionIds: (frontmatter.sessionIds as string[]) ?? [],
        },
        content,
    };
}

export function serializeEntry(entry: DnaEntry): string {
    const fm = entry.frontmatter;
    const lines = [
        '---',
        `id: ${fm.id}`,
        `confidence: ${fm.confidence}`,
        `source: ${fm.source}`,
        `status: ${fm.status}`,
        `category: ${fm.category}`,
        `firstSeen: "${fm.firstSeen}"`,
        `lastSeen: "${fm.lastSeen}"`,
        `occurrences: ${fm.occurrences}`,
    ];

    if (fm.sessionIds.length > 0) {
        lines.push('sessionIds:');
        for (const sid of fm.sessionIds) {
            lines.push(`  - "${sid}"`);
        }
    } else {
        lines.push('sessionIds: []');
    }

    lines.push('---', '', entry.content, '');
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

function parseYamlBlock(block: string): Record<string, unknown> | null {
    const result: Record<string, unknown> = {};
    const lines = block.split('\n');
    let currentArrayKey: string | null = null;
    let currentArray: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('- ')) {
            if (currentArrayKey) {
                currentArray.push(stripQuotes(trimmed.slice(2).trim()));
            }
            continue;
        }

        if (currentArrayKey) {
            result[currentArrayKey] = currentArray;
            currentArrayKey = null;
            currentArray = [];
        }

        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) continue;

        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();

        if (value === '' || value === '[]') {
            if (value === '[]') {
                result[key] = [];
            } else {
                currentArrayKey = key;
                currentArray = [];
            }
            continue;
        }

        const num = Number(value);
        if (!isNaN(num) && value !== '') {
            result[key] = num;
        } else {
            result[key] = stripQuotes(value);
        }
    }

    if (currentArrayKey) {
        result[currentArrayKey] = currentArray;
    }

    return Object.keys(result).length > 0 ? result : null;
}
