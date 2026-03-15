import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const EXTENSION_MAP: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.rb': 'ruby',
    '.php': 'php',
};

const GRAMMAR_MAP: Record<string, string> = {
    javascript: 'tree-sitter-javascript',
    typescript: 'tree-sitter-typescript/typescript',
    tsx: 'tree-sitter-typescript/tsx',
    python: 'tree-sitter-python',
    go: 'tree-sitter-go',
    rust: 'tree-sitter-rust',
    java: 'tree-sitter-java',
    c: 'tree-sitter-c',
    cpp: 'tree-sitter-cpp',
    ruby: 'tree-sitter-ruby',
    php: 'tree-sitter-php/php',
};

export const SUPPORTED_LANGUAGES = Object.keys(GRAMMAR_MAP);

export function detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_MAP[ext] ?? null;
}

const grammarCache = new Map<string, unknown>();

export function getGrammar(language: string): unknown | null {
    if (grammarCache.has(language)) {
        return grammarCache.get(language)!;
    }

    const modulePath = GRAMMAR_MAP[language];
    if (!modulePath) return null;

    try {
        const mod = require(modulePath);
        grammarCache.set(language, mod);
        return mod;
    } catch {
        return null;
    }
}
