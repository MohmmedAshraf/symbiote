import type { SymbioteDB } from '../storage/db.js';

const MUTATING_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)\b/i;
const MULTI_STATEMENT = /;/;
const DEFAULT_MAX_ROWS = 500;

export interface QueryValidation {
    valid: boolean;
    error?: string;
}

export interface QueryOptions {
    maxRows?: number;
}

export function validatePgqQuery(query: string): QueryValidation {
    const trimmed = query.trim();

    if (MULTI_STATEMENT.test(trimmed.replace(/;$/, ''))) {
        return { valid: false, error: 'Multi-statement queries are not allowed' };
    }

    if (MUTATING_KEYWORDS.test(trimmed)) {
        return { valid: false, error: 'Mutating queries are not allowed (read-only)' };
    }

    return { valid: true };
}

export async function executePgqQuery(
    db: SymbioteDB,
    query: string,
    options?: QueryOptions,
): Promise<Record<string, unknown>[]> {
    const validation = validatePgqQuery(query);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
    const limited = `SELECT * FROM (${query.replace(/;$/, '')}) AS __q LIMIT ${maxRows}`;

    return db.all(limited);
}
