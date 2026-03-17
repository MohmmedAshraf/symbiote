export function validateEmail(email: string): boolean {
    return email.includes('@');
}

export const MAX_RETRIES = 3;
