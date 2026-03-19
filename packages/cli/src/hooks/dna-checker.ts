const TS_JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function basename(filePath: string): string {
    const slash = filePath.lastIndexOf('/');
    return slash >= 0 ? filePath.slice(slash + 1) : filePath;
}

export function checkDnaViolations(newContent: string, filePath: string): string | null {
    const dotIdx = filePath.lastIndexOf('.');
    const ext = dotIdx >= 0 ? filePath.slice(dotIdx) : '';
    if (!TS_JS_EXTENSIONS.has(ext)) return null;

    if (/^\t/m.test(newContent)) {
        return `DNA check: found tabs in edit to ${basename(filePath)} — this project uses 4-space indentation.`;
    }

    if (/\bvar\s+/.test(newContent)) {
        return `DNA check: found "var" in edit to ${basename(filePath)} — use const or let.`;
    }

    const lines = newContent.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;
        if (trimmed.includes('<') && trimmed.includes('>')) continue;
        if (trimmed.includes('`')) continue;
        if (trimmed.includes('assert')) continue;
        if (trimmed.includes("'")) continue;
        if (/=\s*"[^"]*"/.test(trimmed) || /\(\s*"[^"]*"/.test(trimmed)) {
            return `DNA check: found double quotes in edit to ${basename(filePath)} — this project uses single quotes.`;
        }
    }

    return null;
}
