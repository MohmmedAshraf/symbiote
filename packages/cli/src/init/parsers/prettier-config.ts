import type { ParsedRule } from './types.js';

interface PrettierConfig {
    semi?: boolean;
    singleQuote?: boolean;
    tabWidth?: number;
    useTabs?: boolean;
    trailingComma?: 'all' | 'es5' | 'none';
    printWidth?: number;
    arrowParens?: 'always' | 'avoid';
    bracketSpacing?: boolean;
    endOfLine?: 'lf' | 'crlf' | 'cr' | 'auto';
    [key: string]: unknown;
}

type RuleFormatter = (value: unknown) => string | null;

const RULE_FORMATTERS: Record<string, RuleFormatter> = {
    semi: (v) => (typeof v === 'boolean' ? (v ? 'Semicolons required' : 'No semicolons') : null),
    singleQuote: (v) => (typeof v === 'boolean' ? (v ? 'Single quotes' : 'Double quotes') : null),
    tabWidth: (v) => (typeof v === 'number' ? `Tab width: ${v}` : null),
    useTabs: (v) =>
        typeof v === 'boolean' ? (v ? 'Indent with tabs' : 'Indent with spaces') : null,
    trailingComma: (v) => (typeof v === 'string' ? `Trailing commas: ${v}` : null),
    printWidth: (v) => (typeof v === 'number' ? `Print width: ${v}` : null),
    arrowParens: (v) => (typeof v === 'string' ? `Arrow parens: ${v}` : null),
    bracketSpacing: (v) =>
        typeof v === 'boolean' ? (v ? 'Bracket spacing enabled' : 'No bracket spacing') : null,
    endOfLine: (v) => (typeof v === 'string' ? `End of line: ${v}` : null),
};

export function parsePrettierConfig(config: PrettierConfig): ParsedRule[] {
    const rules: ParsedRule[] = [];

    for (const [key, formatter] of Object.entries(RULE_FORMATTERS)) {
        if (!(key in config)) {
            continue;
        }

        const text = formatter(config[key]);
        if (!text) {
            continue;
        }

        rules.push({
            text,
            classification: 'style',
            source: 'prettier',
        });
    }

    return rules;
}
