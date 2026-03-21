import path from 'node:path';
import type { DnaProfile } from './schema.js';
import { DnaProfileSchema } from './schema.js';
import type { ProfileStorage } from './profile.js';

const MAX_IMPORT_SIZE = 1024 * 1024;

export function exportProfile(storage: ProfileStorage): DnaProfile {
    const profile = storage.readActiveProfile();
    const clone: DnaProfile = JSON.parse(JSON.stringify(profile));

    for (const entry of clone.entries) {
        if (!entry.origin) continue;

        delete entry.origin.session_id;

        if (entry.origin.file) {
            entry.origin.file = path.basename(entry.origin.file);
        }
    }

    return clone;
}

export function importProfile(
    storage: ProfileStorage,
    raw: string,
): { name: string; entryCount: number } {
    if (raw.length > MAX_IMPORT_SIZE) {
        throw new Error(`Profile exceeds maximum size of ${MAX_IMPORT_SIZE} bytes`);
    }

    const parsed = JSON.parse(raw);
    const profile = DnaProfileSchema.parse(parsed);

    const name = profile.profile.handle
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    storage.saveProfile(name, profile);

    return { name, entryCount: profile.entries.length };
}

export async function importFromUrl(
    storage: ProfileStorage,
    url: string,
): Promise<{ name: string; entryCount: number }> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status} ${response.statusText}`);
    }

    const raw = await response.text();
    return importProfile(storage, raw);
}
