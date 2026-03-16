export type RuleClassification = 'constraint' | 'decision' | 'style' | 'anti-pattern';

export interface ParsedRule {
    text: string;
    classification: RuleClassification;
    source: string;
    section?: string;
}

export type TargetLayer = 'intent' | 'dna';

export interface ClassifiedRule extends ParsedRule {
    target: TargetLayer;
}

export interface TechStackEntry {
    name: string;
    version?: string;
    category:
        | 'framework'
        | 'orm'
        | 'testing'
        | 'styling'
        | 'language'
        | 'bundler'
        | 'linter'
        | 'runtime'
        | 'library';
}

export interface ArchitectureSignal {
    pattern: string;
    confidence: number;
}

export interface ConventionSignal {
    type: 'naming' | 'export' | 'component' | 'file-structure';
    pattern: string;
    examples: string[];
    frequency: number;
}

export interface ProjectAnalysis {
    techStack: TechStackEntry[];
    architecture: ArchitectureSignal[];
    conventions: ConventionSignal[];
    entryPoints: string[];
    description?: string;
}
