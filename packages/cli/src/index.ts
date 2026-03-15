export { createDatabase, type SynapseDB } from './storage/db.js';
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
    ensureSynapseHome,
    getBrainDbPath,
    BRAIN_DIR,
    SYNAPSE_HOME,
} from './utils/config.js';

export const VERSION = '0.1.0';
