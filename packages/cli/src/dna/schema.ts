import { z } from 'zod';

export const DnaEvidenceSchema = z.object({
    first_seen: z.string(),
    last_seen: z.string(),
    occurrences: z.number().int().min(0),
    sessions: z.number().int().min(0),
});

export const DnaOriginSchema = z.object({
    session_id: z.string().optional(),
    file: z.string().optional(),
    context: z.string().optional(),
});

export const DnaEntrySchema = z.object({
    id: z.string(),
    rule: z.string(),
    reason: z.string().default(''),
    category: z.string().default('general'),
    applies_to: z.array(z.string()).default([]),
    not_for: z.array(z.string()).optional(),
    source: z.enum(['explicit', 'correction', 'observed']).default('correction'),
    status: z.enum(['suggested', 'approved', 'rejected']).default('suggested'),
    confidence: z.number().min(0).max(1).default(0.3),
    evidence: DnaEvidenceSchema.default(() => ({
        first_seen: new Date().toISOString().split('T')[0],
        last_seen: new Date().toISOString().split('T')[0],
        occurrences: 1,
        sessions: 0,
    })),
    origin: DnaOriginSchema.optional(),
});

export const DnaProfileMetaSchema = z.object({
    name: z.string(),
    handle: z.string(),
    bio: z.string().default(''),
    created: z.string(),
    updated: z.string(),
});

export const DnaProfileStatsSchema = z.object({
    total_entries: z.number().int(),
    categories: z.array(z.string()),
    top_languages: z.array(z.string()),
    oldest_entry: z.string().nullable(),
    total_sessions: z.number().int(),
});

export const DnaProfileSchema = z.object({
    version: z.literal(1),
    profile: DnaProfileMetaSchema,
    entries: z.array(DnaEntrySchema),
    stats: DnaProfileStatsSchema,
});

export type DnaEntry = z.infer<typeof DnaEntrySchema>;
export type DnaProfile = z.infer<typeof DnaProfileSchema>;
export type DnaProfileMeta = z.infer<typeof DnaProfileMetaSchema>;
export type DnaProfileStats = z.infer<typeof DnaProfileStatsSchema>;
export type DnaEvidence = z.infer<typeof DnaEvidenceSchema>;
export type DnaOrigin = z.infer<typeof DnaOriginSchema>;
export type DnaSource = DnaEntry['source'];
export type DnaStatus = DnaEntry['status'];
