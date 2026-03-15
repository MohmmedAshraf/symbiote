import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { detectLanguage } from '../core/languages.js';

const DEFAULT_IGNORE = [
    'node_modules',
    '.git',
    '.brain',
    'dist',
    'build',
    '.next',
    '.turbo',
    'coverage',
    '__pycache__',
    '.venv',
    'vendor',
    'target',
];

export function walkFiles(
    rootDir: string,
    ignoreDirs: string[] = DEFAULT_IGNORE
): string[] {
    const files: string[] = [];
    const ignoreSet = new Set(ignoreDirs);

    function walk(dir: string): void {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            if (ignoreSet.has(entry.name)) continue;
            if (entry.name.startsWith('.')) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile() && detectLanguage(fullPath)) {
                files.push(fullPath);
            }
        }
    }

    walk(rootDir);
    return files;
}

export function hashFileContent(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto
        .createHash('sha256')
        .update(content)
        .digest('hex')
        .slice(0, 16);
}
