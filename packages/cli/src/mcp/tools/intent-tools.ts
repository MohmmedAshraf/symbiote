import type { ServerContext } from '../context.js';
import type { IntentEntry } from '../../brain/intent.js';

const MAX_ID_LENGTH = 200;

function validateId(id: string): void {
    if (id.length > MAX_ID_LENGTH) {
        throw new Error(`Invalid id: must not exceed ${MAX_ID_LENGTH} characters`);
    }
    if (id.includes('/') || id.includes('\\') || id.includes('..')) {
        throw new Error('Invalid id: must not contain path separators or ".."');
    }
    if (id.includes('\x00') || /[\x00-\x1f]/.test(id)) {
        throw new Error('Invalid id: must not contain null bytes or control characters');
    }
}

function validateScope(scope: string): void {
    if (scope.length > MAX_ID_LENGTH) {
        throw new Error(`Invalid scope: must not exceed ${MAX_ID_LENGTH} characters`);
    }
    if (scope.includes('..') || scope.includes('\x00') || /[\x00-\x1f]/.test(scope)) {
        throw new Error('Invalid scope: must not contain ".." or control characters');
    }
}

export interface GetConstraintsInput {
    scope?: string;
}

export interface GetConstraintsOutput {
    constraints: IntentEntry[];
}

export async function handleGetConstraints(
    ctx: ServerContext,
    input: GetConstraintsInput,
): Promise<GetConstraintsOutput> {
    const constraints = await ctx.intent.listEntries('constraint');

    if (input.scope) {
        return {
            constraints: constraints.filter(
                (c) =>
                    c.frontmatter.scope === 'global' ||
                    c.frontmatter.scope === '*' ||
                    input.scope!.startsWith(c.frontmatter.scope),
            ),
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

export async function handleGetDecisions(
    ctx: ServerContext,
    input: GetDecisionsInput,
): Promise<GetDecisionsOutput> {
    const decisions = await ctx.intent.listEntries('decision');

    if (input.scope) {
        return {
            decisions: decisions.filter(
                (d) =>
                    d.frontmatter.scope === 'global' ||
                    d.frontmatter.scope === '*' ||
                    input.scope!.startsWith(d.frontmatter.scope),
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
    validateId(input.id);
    validateScope(input.scope);

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
    validateId(input.id);
    validateScope(input.scope);

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

const DEPRECATION_PREFIX = '[symbiote] DEPRECATED:';

export async function handleGetConstraintsDeprecated(
    ctx: ServerContext,
    input: GetConstraintsInput,
): Promise<GetConstraintsOutput> {
    console.warn(
        `${DEPRECATION_PREFIX} get_constraints is deprecated. Use get_architecture instead.`,
    );
    return handleGetConstraints(ctx, input);
}

export async function handleGetDecisionsDeprecated(
    ctx: ServerContext,
    input: GetDecisionsInput,
): Promise<GetDecisionsOutput> {
    console.warn(
        `${DEPRECATION_PREFIX} get_decisions is deprecated. Use get_developer_dna instead.`,
    );
    return handleGetDecisions(ctx, input);
}

export function handleProposeDecisionDeprecated(
    ctx: ServerContext,
    input: ProposeDecisionInput,
): ProposeEntryOutput {
    console.warn(
        `${DEPRECATION_PREFIX} propose_decision is deprecated. Use get_developer_dna instead.`,
    );
    return handleProposeDecision(ctx, input);
}

export function handleProposeConstraintDeprecated(
    ctx: ServerContext,
    input: ProposeConstraintInput,
): ProposeEntryOutput {
    console.warn(
        `${DEPRECATION_PREFIX} propose_constraint is deprecated. Use get_architecture instead.`,
    );
    return handleProposeConstraint(ctx, input);
}
