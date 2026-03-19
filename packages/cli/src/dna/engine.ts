import crypto from 'node:crypto';
import { DnaStorage } from './storage.js';
import { type EmbeddingModel, cosineSimilarity } from './embeddings.js';
import { slugify } from '#utils/strings.js';
import type { DnaCategory, DnaEntry, DnaFrontmatter, DnaSource } from './types.js';

const SIMILARITY_THRESHOLD = 0.85;
const AUTO_PROMOTE_SESSIONS = 3;
const BASE_CONFIDENCE = 0.3;
const EXPLICIT_CONFIDENCE = 1.0;

function contentHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
}

export interface SimilarMatch {
    entry: DnaEntry;
    similarity: number;
}

export class DnaEngine {
    private embeddingCache = new Map<string, number[]>();

    constructor(
        private storage: DnaStorage,
        private embeddings?: EmbeddingModel,
    ) {}

    captureInstruction(
        instruction: string,
        sessionId: string,
        source: DnaSource,
        category?: DnaCategory,
    ): DnaEntry {
        const resolvedCategory = category ?? DnaEngine.classifyCategory(instruction);
        const id = DnaEngine.generateId(resolvedCategory, instruction);

        const existing = this.storage.readEntry(id);

        if (existing) {
            return this.updateExistingEntry(existing, sessionId, source);
        }

        const isExplicit = source === 'explicit';
        const today = new Date().toISOString().split('T')[0];

        const entry: DnaEntry = {
            frontmatter: {
                id,
                confidence: isExplicit ? EXPLICIT_CONFIDENCE : BASE_CONFIDENCE,
                source,
                status: isExplicit ? 'approved' : 'suggested',
                category: resolvedCategory,
                firstSeen: today,
                lastSeen: today,
                occurrences: 1,
                sessionIds: [sessionId],
            },
            content: instruction,
        };

        this.storage.writeEntry(entry);
        return entry;
    }

    private async cachedEmbed(text: string): Promise<number[]> {
        const hash = contentHash(text);
        const cached = this.embeddingCache.get(hash);
        if (cached) return cached;

        const embedding = await this.embeddings!.embed(text);
        this.embeddingCache.set(hash, embedding);
        return embedding;
    }

    async captureInstructionWithPatternMatch(
        instruction: string,
        sessionId: string,
        source: DnaSource,
    ): Promise<DnaEntry> {
        if (!this.embeddings) {
            return this.captureInstruction(instruction, sessionId, source);
        }

        const category = DnaEngine.classifyCategory(instruction);
        const sameCategoryEntries = this.storage.listEntries({ category });

        if (sameCategoryEntries.length > 0) {
            const queryEmbedding = await this.cachedEmbed(instruction);

            let bestMatch: DnaEntry | null = null;
            let bestSimilarity = 0;

            for (const entry of sameCategoryEntries) {
                const entryEmbedding = await this.cachedEmbed(entry.content);
                const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);

                if (similarity > SIMILARITY_THRESHOLD && similarity > bestSimilarity) {
                    bestMatch = entry;
                    bestSimilarity = similarity;
                }
            }

            if (bestMatch) {
                return this.updateExistingEntry(bestMatch, sessionId, source);
            }
        }

        return this.captureInstruction(instruction, sessionId, source);
    }

    async findSimilar(instruction: string): Promise<SimilarMatch[]> {
        if (!this.embeddings) return [];

        const allEntries = this.storage.listEntries();
        if (allEntries.length === 0) return [];

        const queryEmbedding = await this.cachedEmbed(instruction);
        const matches: SimilarMatch[] = [];

        for (const entry of allEntries) {
            const entryEmbedding = await this.cachedEmbed(entry.content);
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

        entry.frontmatter.status = 'approved';
        entry.frontmatter.confidence = EXPLICIT_CONFIDENCE;

        this.storage.writeEntry(entry);
        return entry;
    }

    rejectEntry(id: string): DnaEntry | null {
        const entry = this.storage.readEntry(id);
        if (!entry) return null;

        entry.frontmatter.status = 'rejected';

        this.storage.writeEntry(entry);
        return entry;
    }

    editEntry(id: string, newContent: string): DnaEntry | null {
        const entry = this.storage.readEntry(id);
        if (!entry) return null;

        entry.content = newContent;

        this.storage.writeEntry(entry);
        return entry;
    }

    getActiveEntries(): DnaEntry[] {
        return this.storage.listEntries().filter((e) => e.frontmatter.status !== 'rejected');
    }

    batchPassiveReinforce(): void {
        const entries = this.storage
            .listEntries()
            .filter((e) => e.frontmatter.status === 'suggested');
        for (const entry of entries) {
            entry.frontmatter.confidence = Math.min(entry.frontmatter.confidence + 0.05, 0.99);
            this.storage.writeEntry(entry);
        }
    }

    decayUnseenEntries(currentSessionId: string): void {
        const entries = this.storage
            .listEntries()
            .filter((e) => e.frontmatter.status !== 'rejected');
        for (const entry of entries) {
            if (entry.frontmatter.sessionIds.includes(currentSessionId)) continue;
            const lastSeen = new Date(entry.frontmatter.lastSeen).getTime();
            const daysSinceSeen = (Date.now() - lastSeen) / (1000 * 60 * 60 * 24);
            if (daysSinceSeen >= 30) {
                entry.frontmatter.confidence = Math.max(entry.frontmatter.confidence - 0.05, 0.05);
                this.storage.writeEntry(entry);
            }
        }
    }

    autoPromote(): void {
        const entries = this.storage
            .listEntries()
            .filter((e) => e.frontmatter.status === 'suggested');
        for (const entry of entries) {
            if (
                entry.frontmatter.confidence >= 0.7 &&
                entry.frontmatter.sessionIds.length >= AUTO_PROMOTE_SESSIONS
            ) {
                entry.frontmatter.status = 'approved';
                this.storage.writeEntry(entry);
            }
        }
    }

    reinforceObservedEntries(patterns: string[]): void {
        if (patterns.length === 0) return;
        const entries = this.storage
            .listEntries()
            .filter((e) => e.frontmatter.status !== 'rejected');
        const lowerPatterns = patterns.map((p) => p.toLowerCase());
        for (const entry of entries) {
            const lowerContent = entry.content.toLowerCase();
            const matches = lowerPatterns.some((p) => lowerContent.includes(p));
            if (matches) {
                entry.frontmatter.confidence = Math.min(entry.frontmatter.confidence + 0.1, 0.99);
                this.storage.writeEntry(entry);
            }
        }
    }

    private updateExistingEntry(entry: DnaEntry, sessionId: string, source: DnaSource): DnaEntry {
        const fm = entry.frontmatter;
        const today = new Date().toISOString().split('T')[0];

        fm.lastSeen = today;
        fm.occurrences++;

        if (!fm.sessionIds.includes(sessionId)) {
            fm.sessionIds.push(sessionId);
            if (fm.sessionIds.length > 50) {
                fm.sessionIds = fm.sessionIds.slice(-50);
            }
        }

        if (source === 'explicit') {
            fm.confidence = EXPLICIT_CONFIDENCE;
            fm.status = 'approved';
            fm.source = 'explicit';
        } else {
            fm.confidence = this.computeConfidence(fm);
            if (fm.status === 'suggested' && fm.sessionIds.length >= AUTO_PROMOTE_SESSIONS) {
                fm.status = 'approved';
            }
        }

        this.storage.writeEntry(entry);
        return entry;
    }

    private computeConfidence(fm: DnaFrontmatter): number {
        const uniqueSessions = fm.sessionIds.length;

        if (uniqueSessions >= AUTO_PROMOTE_SESSIONS) {
            return Math.min(0.8 + (uniqueSessions - AUTO_PROMOTE_SESSIONS) * 0.05, 0.99);
        }

        return BASE_CONFIDENCE + (uniqueSessions - 1) * 0.2;
    }

    static classifyCategory(instruction: string): DnaCategory {
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

    static generateId(category: DnaCategory, content: string): string {
        const maxSlugLength = 60 - category.length - 1;
        return `${category}-${slugify(content, maxSlugLength)}`;
    }
}
