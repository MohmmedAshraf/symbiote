import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarkdownRules } from './parsers/markdown-rules.js';
import { parseEslintConfig } from './parsers/eslint-config.js';
import { parseTsConfig } from './parsers/tsconfig.js';
import { parsePackageJson } from './parsers/package-json.js';
import { parsePrettierConfig } from './parsers/prettier-config.js';
import type { ClassifiedRule, ParsedRule, TargetLayer } from './parsers/types.js';

const MARKDOWN_FILES = ['CLAUDE.md', '.cursorrules', 'AGENTS.md'];

const ESLINT_FILES = [
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.yml',
    '.eslintrc.yaml',
    '.eslintrc',
];

const PRETTIER_FILES = [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.js',
    '.prettierrc.cjs',
    '.prettierrc.yml',
    '.prettierrc.yaml',
];

function readFileIfExists(filePath: string): string | null {
    try {
        return readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

function readJsonIfExists(filePath: string): unknown | null {
    const content = readFileIfExists(filePath);
    if (!content) {
        return null;
    }

    try {
        return JSON.parse(content);
    } catch {
        return null;
    }
}

function findAndReadJson(
    projectRoot: string,
    filenames: string[],
): unknown | null {
    for (const filename of filenames) {
        const result = readJsonIfExists(join(projectRoot, filename));
        if (result) {
            return result;
        }
    }
    return null;
}

function classifyTarget(rule: ParsedRule): TargetLayer {
    if (rule.classification === 'constraint' || rule.classification === 'decision') {
        return 'intent';
    }
    return 'dna';
}

export function importRules(projectRoot: string): ClassifiedRule[] {
    const rules: ClassifiedRule[] = [];

    for (const filename of MARKDOWN_FILES) {
        const content = readFileIfExists(join(projectRoot, filename));
        if (content) {
            const parsed = parseMarkdownRules(content, filename);
            for (const rule of parsed) {
                rules.push({ ...rule, target: classifyTarget(rule) });
            }
        }
    }

    const eslintConfig = findAndReadJson(projectRoot, ESLINT_FILES);
    if (eslintConfig) {
        const parsed = parseEslintConfig(
            eslintConfig as Parameters<typeof parseEslintConfig>[0],
        );
        for (const rule of parsed) {
            rules.push({ ...rule, target: classifyTarget(rule) });
        }
    }

    const tsconfig = readJsonIfExists(join(projectRoot, 'tsconfig.json'));
    if (tsconfig) {
        const parsed = parseTsConfig(
            tsconfig as Parameters<typeof parseTsConfig>[0],
        );
        for (const rule of parsed) {
            rules.push({ ...rule, target: classifyTarget(rule) });
        }
    }

    const packageJson = readJsonIfExists(join(projectRoot, 'package.json'));
    if (packageJson) {
        const { rules: pkgRules } = parsePackageJson(
            packageJson as Parameters<typeof parsePackageJson>[0],
        );
        for (const rule of pkgRules) {
            rules.push({ ...rule, target: classifyTarget(rule) });
        }
    }

    const prettierConfig = findAndReadJson(projectRoot, PRETTIER_FILES);
    if (prettierConfig) {
        const parsed = parsePrettierConfig(
            prettierConfig as Parameters<typeof parsePrettierConfig>[0],
        );
        for (const rule of parsed) {
            rules.push({ ...rule, target: classifyTarget(rule) });
        }
    }

    return rules;
}
