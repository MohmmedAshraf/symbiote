import type { SymbioteDB } from '../storage/db.js';
import { refreshSymbolsTable } from './schema.js';

const PROPERTY_GRAPH_DDL = `
CREATE PROPERTY GRAPH code_graph
VERTEX TABLES (
    symbols,
    nodes_file,
    nodes_module
)
EDGE TABLES (
    edges_calls      SOURCE KEY (source_id) REFERENCES symbols (id)
                     DESTINATION KEY (target_id) REFERENCES symbols (id),
    edges_imports    SOURCE KEY (source_id) REFERENCES nodes_file (id)
                     DESTINATION KEY (target_id) REFERENCES nodes_file (id),
    edges_extends    SOURCE KEY (source_id) REFERENCES symbols (id)
                     DESTINATION KEY (target_id) REFERENCES symbols (id),
    edges_implements SOURCE KEY (source_id) REFERENCES symbols (id)
                     DESTINATION KEY (target_id) REFERENCES symbols (id),
    edges_contains   SOURCE KEY (source_id) REFERENCES nodes_file (id)
                     DESTINATION KEY (target_id) REFERENCES symbols (id),
    edges_flows_to   SOURCE KEY (source_id) REFERENCES symbols (id)
                     DESTINATION KEY (target_id) REFERENCES symbols (id),
    edges_reads      SOURCE KEY (source_id) REFERENCES symbols (id)
                     DESTINATION KEY (target_id) REFERENCES symbols (id),
    edges_writes     SOURCE KEY (source_id) REFERENCES symbols (id)
                     DESTINATION KEY (target_id) REFERENCES symbols (id),
    edges_returns    SOURCE KEY (source_id) REFERENCES symbols (id)
                     DESTINATION KEY (target_id) REFERENCES symbols (id)
);
`;

export async function installPgq(db: SymbioteDB): Promise<void> {
    try {
        await db.exec('INSTALL duckpgq;');
    } catch {
        // Extension may already be installed locally
    }
    await db.exec('LOAD duckpgq;');
}

export async function isPgqAvailable(db: SymbioteDB): Promise<boolean> {
    try {
        const rows = await db.all<{ loaded: boolean }>(
            `SELECT true as loaded FROM duckdb_extensions()
             WHERE extension_name = 'duckpgq' AND loaded = true`,
        );
        return rows.length > 0;
    } catch {
        return false;
    }
}

export async function createPropertyGraph(db: SymbioteDB): Promise<void> {
    await refreshSymbolsTable(db);
    await db.exec('DROP PROPERTY GRAPH IF EXISTS code_graph;');
    await db.exec(PROPERTY_GRAPH_DDL);
}
