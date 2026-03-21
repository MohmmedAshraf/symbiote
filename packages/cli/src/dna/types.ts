function stripQuotes(s: string): string {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    return s;
}

export function parseYamlBlock(block: string): Record<string, unknown> | null {
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

        const stripped = stripQuotes(value);
        if (/^\d{4}-\d{2}-\d{2}/.test(stripped)) {
            result[key] = stripped;
        } else {
            const num = Number(value);
            if (!isNaN(num) && value !== '') {
                result[key] = num;
            } else {
                result[key] = stripped;
            }
        }
    }

    if (currentArrayKey) {
        result[currentArrayKey] = currentArray;
    }

    return Object.keys(result).length > 0 ? result : null;
}
