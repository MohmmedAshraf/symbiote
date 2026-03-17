import type { User } from './interfaces';

export const userCache = new Map<string, User>();

export function getOrSet<T>(cache: Map<string, T>, key: string, factory: () => T): T {
    const existing = cache.get(key);
    if (existing !== undefined) return existing;
    const value = factory();
    cache.set(key, value);
    return value;
}

export const idSet = new Set<string>();
