import { SymbioteDB } from '../storage/db.js';

export const CORTEX_TABLES = {
    nodes: [
        'nodes_file',
        'nodes_function',
        'nodes_class',
        'nodes_method',
        'nodes_interface',
        'nodes_type',
        'nodes_variable',
        'nodes_module',
    ],
    edges: [
        'edges_calls',
        'edges_imports',
        'edges_extends',
        'edges_implements',
        'edges_contains',
        'edges_flows_to',
        'edges_reads',
        'edges_writes',
        'edges_returns',
    ],
    auxiliary: [
        'cortex_embeddings',
        'cortex_health_snapshots',
        'cortex_temporal_snapshots',
        'cortex_flows',
        'cortex_meta',
        'type_constraints',
        'generic_instantiations',
    ],
} as const;

const NODE_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS nodes_file (
    id VARCHAR PRIMARY KEY,
    path VARCHAR NOT NULL,
    hash VARCHAR,
    language VARCHAR,
    depth_level TINYINT DEFAULT 0,
    last_indexed TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nodes_function (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    qualified_name VARCHAR NOT NULL,
    file_path VARCHAR NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    is_async BOOLEAN DEFAULT false,
    is_exported BOOLEAN DEFAULT false,
    is_entry_point BOOLEAN DEFAULT false,
    entry_point_score FLOAT DEFAULT 0,
    signature VARCHAR,
    community INTEGER,
    page_rank FLOAT,
    betweenness FLOAT
);

CREATE TABLE IF NOT EXISTS nodes_class (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    file_path VARCHAR NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    is_abstract BOOLEAN DEFAULT false,
    is_exported BOOLEAN DEFAULT false,
    community INTEGER,
    page_rank FLOAT,
    betweenness FLOAT
);

CREATE TABLE IF NOT EXISTS nodes_method (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    class_name VARCHAR NOT NULL,
    qualified_name VARCHAR NOT NULL,
    file_path VARCHAR NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    visibility VARCHAR DEFAULT 'public',
    is_static BOOLEAN DEFAULT false,
    is_async BOOLEAN DEFAULT false,
    community INTEGER,
    page_rank FLOAT,
    betweenness FLOAT
);

CREATE TABLE IF NOT EXISTS nodes_interface (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    file_path VARCHAR NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    is_exported BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS nodes_type (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    kind VARCHAR NOT NULL,
    file_path VARCHAR NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    is_exported BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS nodes_variable (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    scope VARCHAR NOT NULL,
    file_path VARCHAR NOT NULL,
    line_start INTEGER,
    line_end INTEGER,
    is_exported BOOLEAN DEFAULT false,
    inferred_type VARCHAR
);

CREATE TABLE IF NOT EXISTS nodes_module (
    id VARCHAR PRIMARY KEY,
    path VARCHAR NOT NULL,
    is_barrel BOOLEAN DEFAULT false
);
`;

const EDGE_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS edges_calls (
    source_id VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    line INTEGER,
    confidence FLOAT DEFAULT 0.9,
    is_dynamic BOOLEAN DEFAULT false,
    is_async BOOLEAN DEFAULT false,
    is_indirect BOOLEAN DEFAULT false,
    stage TINYINT NOT NULL,
    reason VARCHAR
);

CREATE TABLE IF NOT EXISTS edges_imports (
    source_id VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    line INTEGER,
    kind VARCHAR NOT NULL,
    original_name VARCHAR,
    alias VARCHAR,
    confidence FLOAT DEFAULT 1.0,
    stage TINYINT NOT NULL,
    reason VARCHAR
);

CREATE TABLE IF NOT EXISTS edges_extends (
    source_id VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    line INTEGER,
    confidence FLOAT DEFAULT 1.0,
    stage TINYINT NOT NULL,
    reason VARCHAR
);

CREATE TABLE IF NOT EXISTS edges_implements (
    source_id VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    line INTEGER,
    confidence FLOAT DEFAULT 1.0,
    stage TINYINT NOT NULL,
    reason VARCHAR
);

CREATE TABLE IF NOT EXISTS edges_contains (
    source_id VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    confidence FLOAT DEFAULT 1.0,
    stage TINYINT NOT NULL,
    reason VARCHAR
);

CREATE TABLE IF NOT EXISTS edges_flows_to (
    source_id VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    parameter_index INTEGER,
    transform VARCHAR,
    taint_label VARCHAR,
    confidence FLOAT DEFAULT 0.8,
    stage TINYINT NOT NULL,
    reason VARCHAR
);

CREATE TABLE IF NOT EXISTS edges_reads (
    source_id VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    line INTEGER,
    field VARCHAR,
    confidence FLOAT DEFAULT 0.9,
    stage TINYINT NOT NULL,
    reason VARCHAR
);

CREATE TABLE IF NOT EXISTS edges_writes (
    source_id VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    line INTEGER,
    field VARCHAR,
    confidence FLOAT DEFAULT 0.9,
    stage TINYINT NOT NULL,
    reason VARCHAR
);

CREATE TABLE IF NOT EXISTS edges_returns (
    source_id VARCHAR NOT NULL,
    target_id VARCHAR NOT NULL,
    line INTEGER,
    return_type VARCHAR,
    confidence FLOAT DEFAULT 0.85,
    stage TINYINT NOT NULL,
    reason VARCHAR
);
`;

const AUXILIARY_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS cortex_embeddings (
    node_id VARCHAR PRIMARY KEY,
    vector FLOAT[384],
    text_hash VARCHAR
);

CREATE TABLE IF NOT EXISTS cortex_health_snapshots (
    timestamp TIMESTAMP,
    metrics JSON
);

CREATE TABLE IF NOT EXISTS cortex_temporal_snapshots (
    commit_hash VARCHAR,
    timestamp TIMESTAMP,
    node_counts JSON,
    edge_counts JSON,
    community_hash VARCHAR,
    top_pagerank JSON,
    hotspot_rankings JSON
);

CREATE TABLE IF NOT EXISTS cortex_flows (
    id VARCHAR PRIMARY KEY,
    name VARCHAR,
    entry_point_id VARCHAR,
    node_ids VARCHAR[],
    has_async BOOLEAN DEFAULT false,
    has_error_path BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS cortex_meta (
    key VARCHAR PRIMARY KEY,
    value VARCHAR
);
`;

const INDEXES_DDL = `
CREATE INDEX IF NOT EXISTS idx_calls_source ON edges_calls(source_id);
CREATE INDEX IF NOT EXISTS idx_calls_target ON edges_calls(target_id);
CREATE INDEX IF NOT EXISTS idx_imports_source ON edges_imports(source_id);
CREATE INDEX IF NOT EXISTS idx_imports_target ON edges_imports(target_id);
CREATE INDEX IF NOT EXISTS idx_extends_source ON edges_extends(source_id);
CREATE INDEX IF NOT EXISTS idx_extends_target ON edges_extends(target_id);
CREATE INDEX IF NOT EXISTS idx_implements_source ON edges_implements(source_id);
CREATE INDEX IF NOT EXISTS idx_implements_target ON edges_implements(target_id);
CREATE INDEX IF NOT EXISTS idx_contains_source ON edges_contains(source_id);
CREATE INDEX IF NOT EXISTS idx_contains_target ON edges_contains(target_id);
CREATE INDEX IF NOT EXISTS idx_flows_to_source ON edges_flows_to(source_id);
CREATE INDEX IF NOT EXISTS idx_flows_to_target ON edges_flows_to(target_id);
CREATE INDEX IF NOT EXISTS idx_reads_source ON edges_reads(source_id);
CREATE INDEX IF NOT EXISTS idx_reads_target ON edges_reads(target_id);
CREATE INDEX IF NOT EXISTS idx_writes_source ON edges_writes(source_id);
CREATE INDEX IF NOT EXISTS idx_writes_target ON edges_writes(target_id);
CREATE INDEX IF NOT EXISTS idx_returns_source ON edges_returns(source_id);
CREATE INDEX IF NOT EXISTS idx_returns_target ON edges_returns(target_id);
CREATE INDEX IF NOT EXISTS idx_fn_file ON nodes_function(file_path);
CREATE INDEX IF NOT EXISTS idx_class_file ON nodes_class(file_path);
CREATE INDEX IF NOT EXISTS idx_method_file ON nodes_method(file_path);
CREATE INDEX IF NOT EXISTS idx_iface_file ON nodes_interface(file_path);
CREATE INDEX IF NOT EXISTS idx_type_file ON nodes_type(file_path);
CREATE INDEX IF NOT EXISTS idx_var_file ON nodes_variable(file_path);
`;

const STAGE4_TABLES_DDL = `
CREATE TABLE IF NOT EXISTS type_constraints (
    symbol_id VARCHAR NOT NULL,
    type_name VARCHAR NOT NULL,
    source VARCHAR NOT NULL,
    confidence FLOAT DEFAULT 0.85,
    file_path VARCHAR NOT NULL,
    line INTEGER,
    UNIQUE(symbol_id, type_name, source)
);

CREATE TABLE IF NOT EXISTS generic_instantiations (
    symbol_id VARCHAR NOT NULL,
    generic_name VARCHAR NOT NULL,
    type_arguments VARCHAR[],
    file_path VARCHAR NOT NULL,
    line INTEGER
);

CREATE INDEX IF NOT EXISTS idx_constraints_symbol ON type_constraints(symbol_id);
CREATE INDEX IF NOT EXISTS idx_constraints_type ON type_constraints(type_name);
CREATE INDEX IF NOT EXISTS idx_generic_symbol ON generic_instantiations(symbol_id);
`;

const SYMBOLS_VIEW_DDL = `
CREATE OR REPLACE VIEW symbols AS
    SELECT id, name, file_path, line_start, line_end, 'function' AS kind FROM nodes_function
    UNION ALL
    SELECT id, name, file_path, line_start, line_end, 'class' AS kind FROM nodes_class
    UNION ALL
    SELECT id, name, file_path, line_start, line_end, 'method' AS kind FROM nodes_method
    UNION ALL
    SELECT id, name, file_path, line_start, line_end, 'interface' AS kind FROM nodes_interface
    UNION ALL
    SELECT id, name, file_path, line_start, line_end, 'type' AS kind FROM nodes_type
    UNION ALL
    SELECT id, name, file_path, line_start, line_end, 'variable' AS kind FROM nodes_variable;
`;

export async function createCortexSchema(db: SymbioteDB): Promise<void> {
    await db.exec(NODE_TABLES_DDL);
    await db.exec(EDGE_TABLES_DDL);
    await db.exec(AUXILIARY_TABLES_DDL);
    await db.exec(INDEXES_DDL);
    await db.exec(STAGE4_TABLES_DDL);
    await db.exec(SYMBOLS_VIEW_DDL);
}

export async function refreshSymbolsTable(db: SymbioteDB): Promise<void> {
    try {
        await db.exec('DROP VIEW IF EXISTS symbols;');
    } catch {
        /* may be a table */
    }
    try {
        await db.exec('DROP TABLE IF EXISTS symbols;');
    } catch {
        /* may be a view */
    }
    await db.exec(`
        CREATE TABLE symbols AS
            SELECT id, name, file_path, line_start, line_end, 'function' AS kind FROM nodes_function
            UNION ALL
            SELECT id, name, file_path, line_start, line_end, 'class' AS kind FROM nodes_class
            UNION ALL
            SELECT id, name, file_path, line_start, line_end, 'method' AS kind FROM nodes_method
            UNION ALL
            SELECT id, name, file_path, line_start, line_end, 'interface' AS kind FROM nodes_interface
            UNION ALL
            SELECT id, name, file_path, line_start, line_end, 'type' AS kind FROM nodes_type
            UNION ALL
            SELECT id, name, file_path, line_start, line_end, 'variable' AS kind FROM nodes_variable;
    `);
}
