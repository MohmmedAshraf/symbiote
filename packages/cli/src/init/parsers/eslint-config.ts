import type { ParsedRule, RuleClassification } from './types.js';

type RuleValue = string | number | [string | number, ...unknown[]];

interface EslintConfig {
    rules?: Record<string, RuleValue>;
    extends?: string | string[];
    [key: string]: unknown;
}

function getSeverity(value: RuleValue): string | null {
    const level = Array.isArray(value) ? value[0] : value;

    if (level === 'error' || level === 2) {
        return 'error';
    }
    if (level === 'warn' || level === 1) {
        return 'warn';
    }

    return null;
}

function severityToClassification(severity: string): RuleClassification {
    return severity === 'error' ? 'constraint' : 'style';
}

function formatRuleOptions(value: RuleValue): string {
    if (!Array.isArray(value) || value.length <= 1) {
        return '';
    }

    const options = value.slice(1);
    const formatted = options
        .map((opt) => (typeof opt === 'object' ? JSON.stringify(opt) : String(opt)))
        .join(', ');

    return ` (${formatted})`;
}

export function parseEslintConfig(config: EslintConfig): ParsedRule[] {
    const rules: ParsedRule[] = [];

    if (config.extends) {
        const extendsList = Array.isArray(config.extends) ? config.extends : [config.extends];

        rules.push({
            text: `ESLint extends: ${extendsList.join(', ')}`,
            classification: 'decision',
            source: 'eslint',
        });
    }

    if (config.rules) {
        for (const [name, value] of Object.entries(config.rules)) {
            const severity = getSeverity(value);
            if (!severity) {
                continue;
            }

            const options = formatRuleOptions(value);
            rules.push({
                text: `${name}: ${severity}${options}`,
                classification: severityToClassification(severity),
                source: 'eslint',
            });
        }
    }

    return rules;
}
