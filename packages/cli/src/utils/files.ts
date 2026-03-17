import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
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

export async function walkFiles(
    rootDir: string,
    ignoreDirs: string[] = DEFAULT_IGNORE,
): Promise<string[]> {
    const files: string[] = [];
    const ignoreSet = new Set(ignoreDirs);

    async function walk(dir: string): Promise<void> {
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (ignoreSet.has(entry.name)) continue;
            if (entry.name.startsWith('.')) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.isFile() && detectLanguage(fullPath)) {
                files.push(fullPath);
            }
        }
    }

    await walk(rootDir);
    return files;
}

export function hashFileContent(filePath: string, content?: string): string {
    const source = content ?? readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(source).digest('hex').slice(0, 32);
}
