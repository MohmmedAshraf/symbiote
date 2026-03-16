import fs from 'node:fs';
import { createRequire } from 'node:module';
import type { Repository } from '../../storage/repository.js';
import type { IntentStore, IntentEntry } from '../intent.js';
import { detectLanguage, getGrammar } from '../../core/languages.js';
import type {
    ConstraintViolation,
    DescriptiveConstraint,
} from './types.js';

const require = createRequire(import.meta.url);
const Parser = require('tree-sitter');

export interface ConstraintCheckResult {
    violations: ConstraintViolation[];
    descriptive: DescriptiveConstraint[];
}

export class ConstraintChecker {
    constructor(
        private repo: Repository,
        private intent: IntentStore
    ) {}

    async check(): Promise<ConstraintCheckResult> {
        const constraints = this.intent.listEntries('constraint', {
            status: 'active',
        });
        const violations: ConstraintViolation[] = [];
        const descriptive: DescriptiveConstraint[] = [];

        for (const constraint of constraints) {
            if (constraint.frontmatter.pattern) {
                const found = await this.checkWithPattern(constraint);
                violations.push(...found);
            } else {
                descriptive.push({
                    constraintId: constraint.frontmatter.id,
                    description: constraint.content,
                    scope: constraint.frontmatter.scope,
                });
            }
        }

        return { violations, descriptive };
    }

    private async checkWithPattern(
        constraint: IntentEntry
    ): Promise<ConstraintViolation[]> {
        const pattern = constraint.frontmatter.pattern!;
        const violations: ConstraintViolation[] = [];
        const scope = constraint.frontmatter.scope;

        const filePaths = await this.getFilesInScope(scope);

        for (const filePath of filePaths) {
            const lang = detectLanguage(filePath);
            if (!lang) continue;

            const grammar = getGrammar(lang);
            if (!grammar) continue;

            let source: string;
            try {
                source = fs.readFileSync(filePath, 'utf-8');
            } catch {
                continue;
            }

            const parser = new Parser();
            parser.setLanguage(grammar);
            const tree = parser.parse(source);
            const language = parser.getLanguage();

            try {
                const query = new Parser.Query(
                    language,
                    pattern
                );
                const matches = query.matches(tree.rootNode);

                for (const match of matches) {
                    const firstCapture = match.captures[0];
                    if (!firstCapture) continue;

                    const node = firstCapture.node;
                    violations.push({
                        constraintId:
                            constraint.frontmatter.id,
                        constraintDescription:
                            constraint.content,
                        filePath,
                        lineStart:
                            node.startPosition.row + 1,
                        lineEnd:
                            node.endPosition.row + 1,
                        matchedText: node.text.slice(0, 100),
                    });
                }
            } catch {
                continue;
            }
        }

        return violations;
    }

    private async getFilesInScope(scope: string): Promise<string[]> {
        const allNodes = await this.repo.getAllNodes();
        const filePaths = new Set<string>();

        for (const node of allNodes) {
            filePaths.add(node.filePath);
        }

        if (scope === 'global') {
            return [...filePaths];
        }

        return [...filePaths].filter((fp) =>
            fp.includes(scope)
        );
    }
}
