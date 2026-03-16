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
    HealthEngine,
    type HealthReport,
    type HealthSnapshot,
    type ConstraintViolation,
    type DescriptiveConstraint,
    type CircularDep,
    type DeadCodeEntry,
    type CouplingHotspot,
    type CategoryScore,
} from './health/index.js';
export {
    ensureEmbeddingsTable,
    storeEmbedding,
    deleteEmbeddingsForFile,
    semanticSearch,
    type SearchResult,
} from './embeddings.js';
