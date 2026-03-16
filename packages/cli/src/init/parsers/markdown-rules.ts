import type { ParsedRule, RuleClassification } from './types.js';

const ANTI_PATTERN_KEYWORDS = [
    'never', 'don\'t', 'dont', 'avoid', 'do not', 'forbidden',
    'prohibited', 'no ', 'not allowed', 'must not', 'should not',
    'shouldn\'t', 'won\'t', 'cannot', 'can\'t',
];

const DECISION_KEYWORDS = [
    'chose', 'chosen', 'because', 'reason', 'decided', 'decision',
    'rationale', 'switched', 'migrated', 'adopted', 'picked',
    'selected', 'went with', 'opted',
];

const CONSTRAINT_PREFIXES = [
    'use ', 'always ', 'prefer ', 'must ', 'require ', 'ensure ',
    'enforce ', 'mandate ', 'only ', 'all ', 'every ', 'strict',
];

const MIN_RULE_LENGTH = 10;

function classifyRule(text: string): RuleClassification {
    const lower = text.toLowerCase();

    if (ANTI_PATTERN_KEYWORDS.some((kw) => lower.includes(kw))) {
        return 'anti-pattern';
    }

    if (DECISION_KEYWORDS.some((kw) => lower.includes(kw))) {
        return 'decision';
    }

    if (CONSTRAINT_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
        return 'constraint';
    }

    return 'style';
}

export function parseMarkdownRules(content: string, source: string): ParsedRule[] {
    const lines = content.split('\n');
    const rules: ParsedRule[] = [];
    let currentSection: string | undefined;

    for (const line of lines) {
        const trimmed = line.trim();

        const sectionMatch = trimmed.match(/^##\s+(.+)/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].trim();
            continue;
        }

        const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
        if (!bulletMatch) {
            continue;
        }

        const text = bulletMatch[1].trim();
        if (text.length < MIN_RULE_LENGTH) {
            continue;
        }

        rules.push({
            text,
            classification: classifyRule(text),
            source,
            ...(currentSection && { section: currentSection }),
        });
    }

    return rules;
}
