export { createDatabase, type SymbioteDB } from './storage/db.js';
export {
    Repository,
    type NodeRecord,
    type EdgeRecord,
    type FileRecord,
} from './storage/repository.js';
export { Scanner, type ScanOptions, type ScanResult } from './core/scanner.js';
export {
    GraphQuery,
    type FileContext,
    type ProjectOverview,
} from './core/graph.js';
export { parseFile, type ParseResult } from './core/parser.js';
export {
    detectLanguage,
    getGrammar,
    SUPPORTED_LANGUAGES,
} from './core/languages.js';
export { walkFiles, hashFileContent } from './utils/files.js';
export {
    ensureBrainDir,
    ensureSymbioteHome,
    getBrainDbPath,
    BRAIN_DIR,
    SYMBIOTE_HOME,
} from './utils/config.js';

export {
    DnaStorage,
    DnaEngine,
    EmbeddingModel,
    cosineSimilarity,
    parseFrontmatter,
    serializeEntry,
    DNA_CATEGORIES,
    DNA_STATUSES,
    EMBEDDING_DIM,
    type DnaCategory,
    type DnaStatus,
    type DnaSource,
    type DnaFrontmatter,
    type DnaEntry,
    type DnaIndex,
    type DnaIndexEntry,
    type ListOptions,
    type SimilarMatch,
} from './dna/index.js';

export {
    IntentStore,
    parseIntentFrontmatter,
    serializeIntentEntry,
    type IntentEntry,
    type IntentFrontmatter,
    type IntentType,
    type IntentStatus,
    type ListIntentOptions,
    HealthEngine,
    type HealthReport,
    type HealthSnapshot,
    type ConstraintViolation,
    type DescriptiveConstraint,
    type CircularDep,
    type DeadCodeEntry,
    type CouplingHotspot,
    type CategoryScore,
    ensureEmbeddingsTable,
    storeEmbedding,
    deleteEmbeddingsForFile,
    semanticSearch,
    type SearchResult,
} from './brain/index.js';

export {
    createMcpServer,
    createServerContext,
    type ServerContext,
    type ServerContextOptions,
} from './mcp/index.js';

export const VERSION = '0.1.0';
