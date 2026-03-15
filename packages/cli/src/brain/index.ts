export {
    IntentStore,
    parseIntentFrontmatter,
    serializeIntentEntry,
    type IntentEntry,
    type IntentFrontmatter,
    type IntentType,
    type IntentStatus,
    type ListIntentOptions,
} from './intent.js';
export {
    HealthAnalyzer,
    type HealthReport,
    type HealthViolation,
    type CircularDep,
} from './health.js';
export {
    ensureEmbeddingsTable,
    storeEmbedding,
    deleteEmbeddingsForFile,
    semanticSearch,
    type SearchResult,
} from './embeddings.js';
