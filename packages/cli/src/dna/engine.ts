import crypto from 'node:crypto';
import { ProfileStorage } from './profile.js';
import { type EmbeddingModel, cosineSimilarity } from './embeddings.js';
import { slugify } from '#utils/strings.js';
import type { DnaEntry, DnaSource } from './schema.js';

const SIMILARITY_THRESHOLD = 0.85;
const AUTO_PROMOTE_SESSIONS = 3;
const BASE_CONFIDENCE = 0.3;
const EXPLICIT_CONFIDENCE = 1.0;

function contentHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

function today(): string {
    return new Date().toISOString().split('T')[0];
}

export interface SimilarMatch {
    entry: DnaEntry;
    similarity: number;
}

export interface CaptureInput {
    rule: string;
    reason?: string;
    category?: string;
    applies_to?: string[];
    not_for?: string[];
    source: DnaSource;
    sessionId: string;
    file?: string;
    context?: string;
}

export class DnaEngine {
    private embeddingCache = new Map<string, number[]>();

    constructor(
        private storage: ProfileStorage,
        private embeddings?: EmbeddingModel,
    ) {}

    captureInstruction(input: CaptureInput): DnaEntry {
        const category = input.category ?? DnaEngine.classifyCategory(input.rule);
        const id = DnaEngine.generateId(category, input.rule);

        const existing = this.storage.readEntry(id);
        if (existing) {
            return this.reinforceExisting(existing, input.sessionId, input.source);
        }

        const isExplicit = input.source === 'explicit';

        const entry: DnaEntry = {
            id,
            rule: input.rule,
            reason: input.reason ?? '',
            category,
            applies_to: input.applies_to ?? [],
            not_for: input.not_for,
            source: input.source,
            status: isExplicit ? 'approved' : 'suggested',
            confidence: isExplicit ? EXPLICIT_CONFIDENCE : BASE_CONFIDENCE,
            evidence: {
                first_seen: today(),
                last_seen: today(),
                occurrences: 1,
                sessions: 1,
            },
            origin: {
                session_id: input.sessionId,
                file: input.file,
                context: input.context,
            },
        };

        this.storage.writeEntry(entry);
        return entry;
    }

    async captureInstructionWithPatternMatch(input: CaptureInput): Promise<DnaEntry> {
        if (!this.embeddings) {
            return this.captureInstruction(input);
        }

        const category = input.category ?? DnaEngine.classifyCategory(input.rule);
        const allEntries = this.storage.readActiveProfile().entries;
        const sameCategoryEntries = allEntries.filter((e) => e.category === category);

        if (sameCategoryEntries.length > 0) {
            const queryEmbedding = await this.cachedEmbed(input.rule);

            let bestMatch: DnaEntry | null = null;
            let bestSimilarity = 0;

            for (const entry of sameCategoryEntries) {
                const entryEmbedding = await this.cachedEmbed(entry.rule);
                const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);

                if (similarity > SIMILARITY_THRESHOLD && similarity > bestSimilarity) {
                    bestMatch = entry;
                    bestSimilarity = similarity;
                }
            }

            if (bestMatch) {
                return this.reinforceExisting(bestMatch, input.sessionId, input.source);
            }
        }

        return this.captureInstruction(input);
    }

    async findSimilar(instruction: string): Promise<SimilarMatch[]> {
        if (!this.embeddings) return [];

        const allEntries = this.storage.readActiveProfile().entries;
        if (allEntries.length === 0) return [];

        const queryEmbedding = await this.cachedEmbed(instruction);
        const matches: SimilarMatch[] = [];

        for (const entry of allEntries) {
            const entryEmbedding = await this.cachedEmbed(entry.rule);
            const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);

            if (similarity > 0.3) {
                matches.push({ entry, similarity });
            }
        }

        return matches.sort((a, b) => b.similarity - a.similarity);
    }

    approveEntry(id: string): DnaEntry | null {
        const entry = this.storage.readEntry(id);
        if (!entry) return null;

        entry.status = 'approved';
        entry.confidence = EXPLICIT_CONFIDENCE;

        this.storage.writeEntry(entry);
        return entry;
    }

    rejectEntry(id: string): DnaEntry | null {
        const entry = this.storage.readEntry(id);
        if (!entry) return null;

        entry.status = 'rejected';

        this.storage.writeEntry(entry);
        return entry;
    }

    editEntry(
        id: string,
        updates: { rule?: string; reason?: string; applies_to?: string[] },
    ): DnaEntry | null {
        const entry = this.storage.readEntry(id);
        if (!entry) return null;

        if (updates.rule !== undefined) entry.rule = updates.rule;
        if (updates.reason !== undefined) entry.reason = updates.reason;
        if (updates.applies_to !== undefined) entry.applies_to = updates.applies_to;

        this.storage.writeEntry(entry);
        return entry;
    }

    getActiveEntries(): DnaEntry[] {
        return this.storage.readActiveProfile().entries.filter((e) => e.status !== 'rejected');
    }

    batchPassiveReinforce(): void {
        const profile = this.storage.readActiveProfile();
        for (const entry of profile.entries) {
            if (entry.status !== 'suggested') continue;
            entry.confidence = Math.min(entry.confidence + 0.05, 0.99);
            this.storage.writeEntry(entry);
        }
    }

    autoPromote(): void {
        const profile = this.storage.readActiveProfile();
        for (const entry of profile.entries) {
            if (entry.status !== 'suggested') continue;
            if (entry.confidence >= 0.7 && entry.evidence.sessions >= AUTO_PROMOTE_SESSIONS) {
                entry.status = 'approved';
                this.storage.writeEntry(entry);
            }
        }
    }

    decayUnseenEntries(currentSessionId: string): void {
        const profile = this.storage.readActiveProfile();
        for (const entry of profile.entries) {
            if (entry.status === 'rejected') continue;
            if (entry.origin?.session_id === currentSessionId) continue;

            const lastSeen = new Date(entry.evidence.last_seen).getTime();
            const daysSinceSeen = (Date.now() - lastSeen) / (1000 * 60 * 60 * 24);
            if (daysSinceSeen >= 30) {
                entry.confidence = Math.max(entry.confidence - 0.05, 0.05);
                this.storage.writeEntry(entry);
            }
        }
    }

    reinforceObservedEntries(patterns: string[]): void {
        if (patterns.length === 0) return;

        const profile = this.storage.readActiveProfile();
        const lowerPatterns = patterns.map((p) => p.toLowerCase());

        for (const entry of profile.entries) {
            if (entry.status === 'rejected') continue;
            const lowerRule = entry.rule.toLowerCase();
            const matches = lowerPatterns.some((p) => lowerRule.includes(p));
            if (matches) {
                entry.confidence = Math.min(entry.confidence + 0.1, 0.99);
                this.storage.writeEntry(entry);
            }
        }
    }

    private reinforceExisting(entry: DnaEntry, sessionId: string, source: DnaSource): DnaEntry {
        entry.evidence.occurrences++;
        entry.evidence.last_seen = today();

        const isNewSession = entry.origin?.session_id !== sessionId;
        if (isNewSession) {
            entry.evidence.sessions++;
        }

        if (source === 'explicit') {
            entry.confidence = EXPLICIT_CONFIDENCE;
            entry.status = 'approved';
            entry.source = 'explicit';
        } else {
            entry.confidence = this.computeConfidence(entry.evidence.sessions);
            if (entry.status === 'suggested' && entry.evidence.sessions >= AUTO_PROMOTE_SESSIONS) {
                entry.status = 'approved';
            }
        }

        entry.origin = {
            ...entry.origin,
            session_id: sessionId,
        };

        this.storage.writeEntry(entry);
        return entry;
    }

    private computeConfidence(sessions: number): number {
        if (sessions >= AUTO_PROMOTE_SESSIONS) {
            return Math.min(0.8 + (sessions - AUTO_PROMOTE_SESSIONS) * 0.05, 0.99);
        }
        return BASE_CONFIDENCE + (sessions - 1) * 0.2;
    }

    private async cachedEmbed(text: string): Promise<number[]> {
        const hash = contentHash(text);
        const cached = this.embeddingCache.get(hash);
        if (cached) return cached;

        const embedding = await this.embeddings!.embed(text);
        this.embeddingCache.set(hash, embedding);
        return embedding;
    }

    static classifyCategory(instruction: string): string {
        const lower = instruction.toLowerCase();

        const antiPatternRegexes = [
            /\bnever\b/,
            /\bdon'?t\b/,
            /\bdo not\b/,
            /\bavoid\b/,
            /\bno\s/,
            /\bstop\s/,
            /\bforbid/,
        ];
        if (antiPatternRegexes.some((r) => r.test(lower))) {
            return 'anti-patterns';
        }

        const decisionRegexes = [
            /\bchose\b/,
            /\bdecided\b/,
            /\breason\b/,
            /\bbecause\b/,
            /\brationale\b/,
            /\bwhy we\b/,
            /\bthe reason\b/,
        ];
        if (decisionRegexes.some((r) => r.test(lower))) {
            return 'decisions';
        }

        const preferenceRegexes = [
            /\bprefer\b/,
            /\binstead of\b/,
            /\bover\s/,
            /\brather than\b/,
            /\bswitch to\b/,
            /\bmigrate to\b/,
        ];
        if (preferenceRegexes.some((r) => r.test(lower))) {
            return 'preferences';
        }

        if (lower.startsWith('use ') && !lower.includes(' in ')) {
            return 'preferences';
        }

        return 'style';
    }

    static generateId(category: string, content: string): string {
        const maxSlugLength = 60 - category.length - 1;
        return `${category}-${slugify(content, maxSlugLength)}`;
    }
}
