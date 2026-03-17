export function formatResponse(data: unknown): { ok: boolean; data: unknown } {
    return { ok: true, data };
}

export function formatError(message: string): { ok: boolean; error: string } {
    return { ok: false, error: message };
}
