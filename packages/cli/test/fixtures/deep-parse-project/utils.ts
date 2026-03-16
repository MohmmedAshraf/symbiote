export function validateEmail(email: string): boolean {
    return email.includes('@');
}

export function generateId(): string {
    return crypto.randomUUID();
}

export function formatName(name: string): string {
    return name.trim().toLowerCase();
}
