export function setupDb(): Record<string, unknown> {
    return {
        connected: true,
        driver: 'drizzle',
    };
}
