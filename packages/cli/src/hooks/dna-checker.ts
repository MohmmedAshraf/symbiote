import type { DnaEntry } from '#dna/schema.js';

function basename(filePath: string): string {
    const slash = filePath.lastIndexOf('/');
    return slash >= 0 ? filePath.slice(slash + 1) : filePath;
}

export function checkDnaViolations(
    newContent: string,
    filePath: string,
    dnaEntries: DnaEntry[],
): string | null {
    for (const entry of dnaEntries) {
        if (entry.category !== 'anti-patterns') continue;

        const keywords = entry.rule
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3);
        if (keywords.length === 0) continue;

        const lowerContent = newContent.toLowerCase();
        const matched = keywords.some((kw) => lowerContent.includes(kw));
        if (matched) {
            return `DNA violation in ${basename(filePath)}: ${entry.rule}`;
        }
    }

    return null;
}
