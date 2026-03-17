export function validate(input: unknown): boolean {
    return input !== null && input !== undefined;
}

export function formatResponse(data: unknown): string {
    return JSON.stringify(data);
}
