import type { ParsedRule } from './types.js';

interface TsCompilerOptions {
    strict?: boolean;
    noUncheckedIndexedAccess?: boolean;
    exactOptionalPropertyTypes?: boolean;
    noImplicitReturns?: boolean;
    noFallthroughCasesInSwitch?: boolean;
    noImplicitOverride?: boolean;
    noPropertyAccessFromIndexSignature?: boolean;
    forceConsistentCasingInFileNames?: boolean;
    strictNullChecks?: boolean;
    strictFunctionTypes?: boolean;
    strictBindCallApply?: boolean;
    strictPropertyInitialization?: boolean;
    noImplicitAny?: boolean;
    noImplicitThis?: boolean;
    alwaysStrict?: boolean;
    target?: string;
    module?: string;
    moduleResolution?: string;
    jsx?: string;
    lib?: string[];
    paths?: Record<string, string[]>;
    [key: string]: unknown;
}

interface TsConfig {
    compilerOptions?: TsCompilerOptions;
    [key: string]: unknown;
}

const STRICT_FLAGS: readonly string[] = [
    'strict',
    'noUncheckedIndexedAccess',
    'exactOptionalPropertyTypes',
    'noImplicitReturns',
    'noFallthroughCasesInSwitch',
    'noImplicitOverride',
    'noPropertyAccessFromIndexSignature',
    'forceConsistentCasingInFileNames',
    'strictNullChecks',
    'strictFunctionTypes',
    'strictBindCallApply',
    'strictPropertyInitialization',
    'noImplicitAny',
    'noImplicitThis',
    'alwaysStrict',
];

const DECISION_FLAGS: readonly string[] = ['target', 'module', 'moduleResolution', 'jsx'];

export function parseTsConfig(config: TsConfig): ParsedRule[] {
    const rules: ParsedRule[] = [];
    const options = config.compilerOptions;

    if (!options) {
        return rules;
    }

    for (const flag of STRICT_FLAGS) {
        if (options[flag] === true) {
            rules.push({
                text: `${flag}: enabled`,
                classification: 'constraint',
                source: 'tsconfig',
            });
        }
    }

    for (const flag of DECISION_FLAGS) {
        const value = options[flag];
        if (typeof value === 'string') {
            rules.push({
                text: `${flag}: ${value}`,
                classification: 'decision',
                source: 'tsconfig',
            });
        }
    }

    if (options.lib && options.lib.length > 0) {
        rules.push({
            text: `lib: ${options.lib.join(', ')}`,
            classification: 'decision',
            source: 'tsconfig',
        });
    }

    if (options.paths) {
        const aliases = Object.keys(options.paths);
        for (const alias of aliases) {
            const targets = options.paths[alias];
            rules.push({
                text: `Path alias ${alias} -> ${targets.join(', ')}`,
                classification: 'style',
                source: 'tsconfig',
            });
        }
    }

    return rules;
}
