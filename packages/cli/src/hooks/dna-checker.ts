import type { DnaEntry } from '#dna/types.js';

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
        const pattern = entry.frontmatter.pattern;
        if (!pattern) continue;

        try {
            const regex = new RegExp(pattern, 'm');
            if (regex.test(newContent)) {
                return `DNA violation in ${basename(filePath)}: ${entry.content}`;
            }
        } catch {
            // invalid regex in DNA entry — skip
        }
    }

    return null;
}
