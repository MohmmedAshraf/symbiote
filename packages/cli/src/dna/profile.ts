import fs from 'node:fs';
import path from 'node:path';
import type { DnaEntry, DnaProfile, DnaProfileStats } from './schema.js';

interface Config {
    active_profile: string;
}

function today(): string {
    return new Date().toISOString().split('T')[0];
}

function computeStats(entries: DnaEntry[]): DnaProfileStats {
    const categories = [...new Set(entries.map((e) => e.category))];

    const langCounts = new Map<string, number>();
    for (const entry of entries) {
        for (const lang of entry.applies_to) {
            langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
        }
    }
    const topLanguages = [...langCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([lang]) => lang);

    let oldestEntry: string | null = null;
    for (const entry of entries) {
        const firstSeen = entry.evidence.first_seen;
        if (!oldestEntry || firstSeen < oldestEntry) {
            oldestEntry = firstSeen;
        }
    }

    const sessionIds = new Set<string>();
    let maxPerEntry = 0;
    for (const entry of entries) {
        if (entry.origin?.session_id) {
            sessionIds.add(entry.origin.session_id);
        }
        maxPerEntry = Math.max(maxPerEntry, entry.evidence.sessions);
    }
    const totalSessions = sessionIds.size > 0 ? sessionIds.size : maxPerEntry;

    return {
        total_entries: entries.length,
        categories,
        top_languages: topLanguages,
        oldest_entry: oldestEntry,
        total_sessions: totalSessions,
    };
}

function atomicWrite(filePath: string, data: string): void {
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, data);
    fs.renameSync(tmpPath, filePath);
}

export class ProfileStorage {
    private readonly profilesDir: string;
    private readonly configPath: string;

    constructor(symbioteHome: string) {
        this.profilesDir = path.join(symbioteHome, 'profiles');
        this.configPath = path.join(symbioteHome, 'config.json');
    }

    ensurePersonalProfile(name: string, handle: string): void {
        fs.mkdirSync(this.profilesDir, { recursive: true });

        const profilePath = this.profilePath('personal');
        if (fs.existsSync(profilePath)) return;

        const profile: DnaProfile = {
            version: 1,
            profile: {
                name,
                handle,
                bio: '',
                created: today(),
                updated: today(),
            },
            entries: [],
            stats: computeStats([]),
        };

        this.saveProfile('personal', profile);

        if (!fs.existsSync(this.configPath)) {
            atomicWrite(
                this.configPath,
                JSON.stringify({ active_profile: 'personal' }, null, 4) + '\n',
            );
        }
    }

    readProfile(name: string): DnaProfile | null {
        const filePath = this.profilePath(name);
        if (!fs.existsSync(filePath)) return null;

        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as DnaProfile;
    }

    readActiveProfile(): DnaProfile {
        const name = this.getActiveProfileName();
        const profile = this.readProfile(name);
        if (profile) return profile;

        const fallback = this.readProfile('personal');
        if (fallback) return fallback;

        this.ensurePersonalProfile('', '');
        return this.readProfile('personal')!;
    }

    writeEntry(entry: DnaEntry): void {
        const name = this.getActiveProfileName();
        const profile = this.readProfile(name);
        if (!profile) {
            throw new Error(`Active profile "${name}" not found`);
        }

        const idx = profile.entries.findIndex((e) => e.id === entry.id);
        if (idx >= 0) {
            profile.entries[idx] = entry;
        } else {
            profile.entries.push(entry);
        }

        profile.profile.updated = today();
        profile.stats = computeStats(profile.entries);
        this.saveProfile(name, profile);
    }

    reinforceEntry(id: string, sessionId: string): void {
        const name = this.getActiveProfileName();
        const profile = this.readProfile(name);
        if (!profile) return;

        const entry = profile.entries.find((e) => e.id === id);
        if (!entry) return;

        entry.evidence.occurrences += 1;
        entry.evidence.last_seen = today();

        const isSameSession = entry.origin?.session_id === sessionId;
        if (!isSameSession) {
            entry.evidence.sessions += 1;
        }

        profile.profile.updated = today();
        profile.stats = computeStats(profile.entries);
        this.saveProfile(name, profile);
    }

    readEntry(id: string): DnaEntry | null {
        const name = this.getActiveProfileName();
        const profile = this.readProfile(name);
        if (!profile) return null;

        return profile.entries.find((e) => e.id === id) ?? null;
    }

    deleteEntry(id: string): void {
        const name = this.getActiveProfileName();
        const profile = this.readProfile(name);
        if (!profile) return;

        profile.entries = profile.entries.filter((e) => e.id !== id);
        profile.profile.updated = today();
        profile.stats = computeStats(profile.entries);
        this.saveProfile(name, profile);
    }

    listProfiles(): string[] {
        if (!fs.existsSync(this.profilesDir)) return [];

        return fs
            .readdirSync(this.profilesDir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => f.replace(/\.json$/, ''));
    }

    getActiveProfileName(): string {
        if (!fs.existsSync(this.configPath)) return 'personal';

        try {
            const raw = fs.readFileSync(this.configPath, 'utf-8');
            const config = JSON.parse(raw) as Config;
            return config.active_profile ?? 'personal';
        } catch {
            return 'personal';
        }
    }

    switchProfile(name: string): void {
        const profilePath = this.profilePath(name);
        if (!fs.existsSync(profilePath)) {
            throw new Error(`Profile "${name}" does not exist`);
        }

        const config: Config = { active_profile: name };
        atomicWrite(this.configPath, JSON.stringify(config, null, 4) + '\n');
    }

    saveProfile(name: string, profile: DnaProfile): void {
        fs.mkdirSync(this.profilesDir, { recursive: true });
        const filePath = this.profilePath(name);
        atomicWrite(filePath, JSON.stringify(profile, null, 4) + '\n');
    }

    private profilePath(name: string): string {
        return path.join(this.profilesDir, `${name}.json`);
    }
}
