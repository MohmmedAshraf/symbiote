export function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function slugify(s: string): string {
    return s.toLowerCase().replace(/\s+/g, '-');
}
