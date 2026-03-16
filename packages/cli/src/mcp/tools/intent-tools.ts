import type { ServerContext } from '../context.js';
import type { IntentEntry } from '../../brain/intent.js';

export interface GetConstraintsInput {
    scope?: string;
}

export interface GetConstraintsOutput {
    constraints: IntentEntry[];
}

export function handleGetConstraints(
    ctx: ServerContext,
    input: GetConstraintsInput,
): GetConstraintsOutput {
    const constraints = ctx.intent.listEntries('constraint');

    if (input.scope) {
        return {
            constraints: constraints.filter((c) => c.frontmatter.scope === input.scope),
        };
    }

    return { constraints };
}

export interface GetDecisionsInput {
    scope?: string;
}

export interface GetDecisionsOutput {
    decisions: IntentEntry[];
}

export function handleGetDecisions(
    ctx: ServerContext,
    input: GetDecisionsInput,
): GetDecisionsOutput {
    const decisions = ctx.intent.listEntries('decision');

    if (input.scope) {
        return {
            decisions: decisions.filter(
                (d) => d.frontmatter.scope === 'global' || d.frontmatter.scope === input.scope,
            ),
        };
    }

    return { decisions };
}

export interface ProposeDecisionInput {
    id: string;
    content: string;
    scope: string;
}

export interface ProposeEntryOutput {
    entry: IntentEntry;
}

export function handleProposeDecision(
    ctx: ServerContext,
    input: ProposeDecisionInput,
): ProposeEntryOutput {
    const entry: IntentEntry = {
        frontmatter: {
            id: input.id,
            type: 'decision',
            scope: input.scope,
            status: 'proposed',
            author: 'ai',
            createdAt: new Date().toISOString().split('T')[0],
        },
        content: input.content,
    };

    ctx.intent.writeEntry(entry);
    return { entry };
}

export interface ProposeConstraintInput {
    id: string;
    content: string;
    scope: string;
}

export function handleProposeConstraint(
    ctx: ServerContext,
    input: ProposeConstraintInput,
): ProposeEntryOutput {
    const entry: IntentEntry = {
        frontmatter: {
            id: input.id,
            type: 'constraint',
            scope: input.scope,
            status: 'proposed',
            author: 'ai',
            createdAt: new Date().toISOString().split('T')[0],
        },
        content: input.content,
    };

    ctx.intent.writeEntry(entry);
    return { entry };
}
