import type { SymbioteDB } from '../storage/db.js';
import type {
    FileNode,
    FunctionNode,
    ClassNode,
    MethodNode,
    InterfaceNode,
    TypeNode,
    VariableNode,
    ModuleNode,
    CallsEdge,
    ImportsEdge,
    ExtendsEdge,
    ImplementsEdge,
    ContainsEdge,
    SymbolTableEntry,
} from './types.js';

const CHUNK_SIZE = 500;

interface FileNodeRow extends Record<string, unknown> {
    id: string;
    path: string;
    hash: string | null;
    language: string | null;
    depth_level: number;
    last_indexed: string | null;
}

interface FunctionNodeRow extends Record<string, unknown> {
    id: string;
    name: string;
    qualified_name: string;
    file_path: string;
    line_start: number;
    line_end: number;
    is_async: boolean;
    is_exported: boolean;
    is_entry_point: boolean;
    entry_point_score: number;
    signature: string | null;
    community: number | null;
    page_rank: number | null;
    betweenness: number | null;
}

interface ClassNodeRow extends Record<string, unknown> {
    id: string;
    name: string;
    file_path: string;
    line_start: number;
    line_end: number;
    is_abstract: boolean;
    is_exported: boolean;
    community: number | null;
    page_rank: number | null;
    betweenness: number | null;
}

interface MethodNodeRow extends Record<string, unknown> {
    id: string;
    name: string;
    class_name: string;
    qualified_name: string;
    file_path: string;
    line_start: number;
    line_end: number;
    visibility: string;
    is_static: boolean;
    is_async: boolean;
    community: number | null;
    page_rank: number | null;
    betweenness: number | null;
}

interface InterfaceNodeRow extends Record<string, unknown> {
    id: string;
    name: string;
    file_path: string;
    line_start: number;
    line_end: number;
    is_exported: boolean;
}

interface TypeNodeRow extends Record<string, unknown> {
    id: string;
    name: string;
    kind: string;
    file_path: string;
    line_start: number;
    line_end: number;
    is_exported: boolean;
}

interface VariableNodeRow extends Record<string, unknown> {
    id: string;
    name: string;
    scope: string;
    file_path: string;
    line_start: number;
    line_end: number;
    is_exported: boolean;
    inferred_type: string | null;
}

interface ModuleNodeRow extends Record<string, unknown> {
    id: string;
    path: string;
    is_barrel: boolean;
}

interface CallsEdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
    line: number | null;
    confidence: number;
    is_dynamic: boolean;
    is_async: boolean;
    is_indirect: boolean;
    stage: number;
    reason: string | null;
}

interface ImportsEdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
    line: number | null;
    kind: string;
    original_name: string | null;
    alias: string | null;
    confidence: number;
    stage: number;
    reason: string | null;
}

interface ImplementsEdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
    line: number | null;
    confidence: number;
    stage: number;
    reason: string | null;
}

interface ContainsEdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
    confidence: number;
    stage: number;
    reason: string | null;
}

interface IdRow extends Record<string, unknown> {
    id: string;
}

interface SymbolRow extends Record<string, unknown> {
    id: string;
    name: string;
    file_path: string;
    line_start: number;
    line_end: number;
    kind: string;
}

interface MetaRow extends Record<string, unknown> {
    key: string;
    value: string;
}

export class CortexRepository {
    constructor(private db: SymbioteDB) {}

    async upsertFileNode(node: FileNode): Promise<void> {
        await this.db.run(
            `INSERT OR REPLACE INTO nodes_file (id, path, hash, language, depth_level, last_indexed)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            node.id,
            node.path,
            node.hash,
            node.language,
            node.depthLevel,
            node.lastIndexed ? node.lastIndexed.toISOString() : null,
        );
    }

    async getFileNode(id: string): Promise<FileNode | null> {
        const rows = await this.db.all<FileNodeRow>('SELECT * FROM nodes_file WHERE id = $1', id);
        if (rows.length === 0) return null;
        return this.mapFileNodeRow(rows[0]);
    }

    async getFilesByMaxDepth(maxDepth: number): Promise<FileNode[]> {
        const rows = await this.db.all<FileNodeRow>(
            'SELECT * FROM nodes_file WHERE depth_level < $1',
            maxDepth,
        );
        return rows.map((r) => this.mapFileNodeRow(r));
    }

    async getAllFileNodes(): Promise<FileNode[]> {
        const rows = await this.db.all<FileNodeRow>('SELECT * FROM nodes_file');
        return rows.map((r) => this.mapFileNodeRow(r));
    }

    async isFileChanged(id: string, hash: string): Promise<boolean> {
        const node = await this.getFileNode(id);
        if (!node) return true;
        return node.hash !== hash;
    }

    async insertFunctionNodes(nodes: FunctionNode[]): Promise<void> {
        if (nodes.length === 0) return;
        await this.batchInsert(
            nodes,
            14,
            (node, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14})`,
                params: [
                    node.id,
                    node.name,
                    node.qualifiedName,
                    node.filePath,
                    node.lineStart,
                    node.lineEnd,
                    node.isAsync,
                    node.isExported,
                    node.isEntryPoint,
                    node.entryPointScore,
                    node.signature,
                    node.community,
                    node.pageRank,
                    node.betweenness,
                ],
            }),
            `INSERT INTO nodes_function (id, name, qualified_name, file_path, line_start, line_end, is_async, is_exported, is_entry_point, entry_point_score, signature, community, page_rank, betweenness) VALUES`,
        );
    }

    async insertClassNodes(nodes: ClassNode[]): Promise<void> {
        if (nodes.length === 0) return;
        await this.batchInsert(
            nodes,
            10,
            (node, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`,
                params: [
                    node.id,
                    node.name,
                    node.filePath,
                    node.lineStart,
                    node.lineEnd,
                    node.isAbstract,
                    node.isExported,
                    node.community,
                    node.pageRank,
                    node.betweenness,
                ],
            }),
            `INSERT INTO nodes_class (id, name, file_path, line_start, line_end, is_abstract, is_exported, community, page_rank, betweenness) VALUES`,
        );
    }

    async insertMethodNodes(nodes: MethodNode[]): Promise<void> {
        if (nodes.length === 0) return;
        await this.batchInsert(
            nodes,
            13,
            (node, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`,
                params: [
                    node.id,
                    node.name,
                    node.className,
                    node.qualifiedName,
                    node.filePath,
                    node.lineStart,
                    node.lineEnd,
                    node.visibility,
                    node.isStatic,
                    node.isAsync,
                    node.community,
                    node.pageRank,
                    node.betweenness,
                ],
            }),
            `INSERT INTO nodes_method (id, name, class_name, qualified_name, file_path, line_start, line_end, visibility, is_static, is_async, community, page_rank, betweenness) VALUES`,
        );
    }

    async insertInterfaceNodes(nodes: InterfaceNode[]): Promise<void> {
        if (nodes.length === 0) return;
        await this.batchInsert(
            nodes,
            6,
            (node, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`,
                params: [
                    node.id,
                    node.name,
                    node.filePath,
                    node.lineStart,
                    node.lineEnd,
                    node.isExported,
                ],
            }),
            `INSERT INTO nodes_interface (id, name, file_path, line_start, line_end, is_exported) VALUES`,
        );
    }

    async insertTypeNodes(nodes: TypeNode[]): Promise<void> {
        if (nodes.length === 0) return;
        await this.batchInsert(
            nodes,
            7,
            (node, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
                params: [
                    node.id,
                    node.name,
                    node.kind,
                    node.filePath,
                    node.lineStart,
                    node.lineEnd,
                    node.isExported,
                ],
            }),
            `INSERT INTO nodes_type (id, name, kind, file_path, line_start, line_end, is_exported) VALUES`,
        );
    }

    async insertVariableNodes(nodes: VariableNode[]): Promise<void> {
        if (nodes.length === 0) return;
        await this.batchInsert(
            nodes,
            8,
            (node, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`,
                params: [
                    node.id,
                    node.name,
                    node.scope,
                    node.filePath,
                    node.lineStart,
                    node.lineEnd,
                    node.isExported,
                    node.inferredType,
                ],
            }),
            `INSERT INTO nodes_variable (id, name, scope, file_path, line_start, line_end, is_exported, inferred_type) VALUES`,
        );
    }

    async insertModuleNodes(nodes: ModuleNode[]): Promise<void> {
        if (nodes.length === 0) return;
        await this.batchInsert(
            nodes,
            3,
            (node, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3})`,
                params: [node.id, node.path, node.isBarrel],
            }),
            `INSERT OR REPLACE INTO nodes_module (id, path, is_barrel) VALUES`,
        );
    }

    async insertCallsEdges(edges: CallsEdge[]): Promise<void> {
        if (edges.length === 0) return;
        await this.batchInsert(
            edges,
            9,
            (edge, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`,
                params: [
                    edge.sourceId,
                    edge.targetId,
                    edge.line,
                    edge.confidence,
                    edge.isDynamic,
                    edge.isAsync,
                    edge.isIndirect,
                    edge.stage,
                    edge.reason,
                ],
            }),
            `INSERT INTO edges_calls (source_id, target_id, line, confidence, is_dynamic, is_async, is_indirect, stage, reason) VALUES`,
        );
    }

    async insertImportsEdges(edges: ImportsEdge[]): Promise<void> {
        if (edges.length === 0) return;
        await this.batchInsert(
            edges,
            9,
            (edge, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`,
                params: [
                    edge.sourceId,
                    edge.targetId,
                    edge.line,
                    edge.kind,
                    edge.originalName,
                    edge.alias,
                    edge.confidence,
                    edge.stage,
                    edge.reason,
                ],
            }),
            `INSERT INTO edges_imports (source_id, target_id, line, kind, original_name, alias, confidence, stage, reason) VALUES`,
        );
    }

    async insertExtendsEdges(edges: ExtendsEdge[]): Promise<void> {
        if (edges.length === 0) return;
        await this.batchInsert(
            edges,
            6,
            (edge, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`,
                params: [
                    edge.sourceId,
                    edge.targetId,
                    edge.line,
                    edge.confidence,
                    edge.stage,
                    edge.reason,
                ],
            }),
            `INSERT INTO edges_extends (source_id, target_id, line, confidence, stage, reason) VALUES`,
        );
    }

    async insertImplementsEdges(edges: ImplementsEdge[]): Promise<void> {
        if (edges.length === 0) return;
        await this.batchInsert(
            edges,
            6,
            (edge, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`,
                params: [
                    edge.sourceId,
                    edge.targetId,
                    edge.line,
                    edge.confidence,
                    edge.stage,
                    edge.reason,
                ],
            }),
            `INSERT INTO edges_implements (source_id, target_id, line, confidence, stage, reason) VALUES`,
        );
    }

    async insertContainsEdges(edges: ContainsEdge[]): Promise<void> {
        if (edges.length === 0) return;
        await this.batchInsert(
            edges,
            5,
            (edge, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
                params: [edge.sourceId, edge.targetId, edge.confidence, edge.stage, edge.reason],
            }),
            `INSERT INTO edges_contains (source_id, target_id, confidence, stage, reason) VALUES`,
        );
    }

    async insertReturnsEdges(
        edges: {
            sourceId: string;
            targetId: string;
            line: number | null;
            returnType: string | null;
            confidence: number;
            stage: number;
            reason: string | null;
        }[],
    ): Promise<void> {
        if (edges.length === 0) return;
        await this.batchInsert(
            edges,
            7,
            (edge, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
                params: [
                    edge.sourceId,
                    edge.targetId,
                    edge.line,
                    edge.returnType,
                    edge.confidence,
                    edge.stage,
                    edge.reason,
                ],
            }),
            `INSERT INTO edges_returns (source_id, target_id, line, return_type, confidence, stage, reason) VALUES`,
        );
    }

    async insertReadsEdges(
        edges: {
            sourceId: string;
            targetId: string;
            line: number | null;
            field: string | null;
            confidence: number;
            stage: number;
            reason: string | null;
        }[],
    ): Promise<void> {
        if (edges.length === 0) return;
        await this.batchInsert(
            edges,
            7,
            (edge, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
                params: [
                    edge.sourceId,
                    edge.targetId,
                    edge.line,
                    edge.field,
                    edge.confidence,
                    edge.stage,
                    edge.reason,
                ],
            }),
            `INSERT INTO edges_reads (source_id, target_id, line, field, confidence, stage, reason) VALUES`,
        );
    }

    async insertWritesEdges(
        edges: {
            sourceId: string;
            targetId: string;
            line: number | null;
            field: string | null;
            confidence: number;
            stage: number;
            reason: string | null;
        }[],
    ): Promise<void> {
        if (edges.length === 0) return;
        await this.batchInsert(
            edges,
            7,
            (edge, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`,
                params: [
                    edge.sourceId,
                    edge.targetId,
                    edge.line,
                    edge.field,
                    edge.confidence,
                    edge.stage,
                    edge.reason,
                ],
            }),
            `INSERT INTO edges_writes (source_id, target_id, line, field, confidence, stage, reason) VALUES`,
        );
    }

    async insertFlowsToEdges(
        edges: {
            sourceId: string;
            targetId: string;
            parameterIndex: number | null;
            transform: string | null;
            taintLabel: string | null;
            confidence: number;
            stage: number;
            reason: string | null;
        }[],
    ): Promise<void> {
        if (edges.length === 0) return;
        await this.batchInsert(
            edges,
            8,
            (edge, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`,
                params: [
                    edge.sourceId,
                    edge.targetId,
                    edge.parameterIndex,
                    edge.transform,
                    edge.taintLabel,
                    edge.confidence,
                    edge.stage,
                    edge.reason,
                ],
            }),
            `INSERT INTO edges_flows_to (source_id, target_id, parameter_index, transform, taint_label, confidence, stage, reason) VALUES`,
        );
    }

    async getFunctionsByFile(filePath: string): Promise<FunctionNode[]> {
        const rows = await this.db.all<FunctionNodeRow>(
            'SELECT * FROM nodes_function WHERE file_path = $1',
            filePath,
        );
        return rows.map(this.mapFunctionNodeRow);
    }

    async getClassesByFile(filePath: string): Promise<ClassNode[]> {
        const rows = await this.db.all<ClassNodeRow>(
            'SELECT * FROM nodes_class WHERE file_path = $1',
            filePath,
        );
        return rows.map(this.mapClassNodeRow);
    }

    async getMethodsByFile(filePath: string): Promise<MethodNode[]> {
        const rows = await this.db.all<MethodNodeRow>(
            'SELECT * FROM nodes_method WHERE file_path = $1',
            filePath,
        );
        return rows.map(this.mapMethodNodeRow);
    }

    async getInterfacesByFile(filePath: string): Promise<InterfaceNode[]> {
        const rows = await this.db.all<InterfaceNodeRow>(
            'SELECT * FROM nodes_interface WHERE file_path = $1',
            filePath,
        );
        return rows.map(this.mapInterfaceNodeRow);
    }

    async getTypesByFile(filePath: string): Promise<TypeNode[]> {
        const rows = await this.db.all<TypeNodeRow>(
            'SELECT * FROM nodes_type WHERE file_path = $1',
            filePath,
        );
        return rows.map(this.mapTypeNodeRow);
    }

    async getVariablesByFile(filePath: string): Promise<VariableNode[]> {
        const rows = await this.db.all<VariableNodeRow>(
            'SELECT * FROM nodes_variable WHERE file_path = $1',
            filePath,
        );
        return rows.map(this.mapVariableNodeRow);
    }

    async getCallsFrom(sourceId: string): Promise<CallsEdge[]> {
        const rows = await this.db.all<CallsEdgeRow>(
            'SELECT * FROM edges_calls WHERE source_id = $1',
            sourceId,
        );
        return rows.map(this.mapCallsEdgeRow);
    }

    async getCallsTo(targetId: string): Promise<CallsEdge[]> {
        const rows = await this.db.all<CallsEdgeRow>(
            'SELECT * FROM edges_calls WHERE target_id = $1',
            targetId,
        );
        return rows.map(this.mapCallsEdgeRow);
    }

    async getContainedBy(sourceId: string): Promise<ContainsEdge[]> {
        const rows = await this.db.all<ContainsEdgeRow>(
            'SELECT * FROM edges_contains WHERE source_id = $1',
            sourceId,
        );
        return rows.map(this.mapContainsEdgeRow);
    }

    async getImportsFrom(sourceId: string): Promise<ImportsEdge[]> {
        const rows = await this.db.all<ImportsEdgeRow>(
            'SELECT * FROM edges_imports WHERE source_id = $1',
            sourceId,
        );
        return rows.map(this.mapImportsEdgeRow);
    }

    async getImportersOf(targetId: string): Promise<ImportsEdge[]> {
        const rows = await this.db.all<ImportsEdgeRow>(
            'SELECT * FROM edges_imports WHERE target_id = $1',
            targetId,
        );
        return rows.map(this.mapImportsEdgeRow);
    }

    async getImplementsFrom(sourceId: string): Promise<ImplementsEdge[]> {
        const rows = await this.db.all<ImplementsEdgeRow>(
            'SELECT * FROM edges_implements WHERE source_id = $1',
            sourceId,
        );
        return rows.map(this.mapImplementsEdgeRow);
    }

    async getModuleNode(id: string): Promise<ModuleNode | null> {
        const rows = await this.db.all<ModuleNodeRow>(
            'SELECT * FROM nodes_module WHERE id = $1',
            id,
        );
        if (rows.length === 0) return null;
        return this.mapModuleNodeRow(rows[0]);
    }

    async deleteFileData(filePath: string): Promise<void> {
        const nodeIds = await this.getNodeIdsForFile(filePath);
        await this.db.exec('BEGIN TRANSACTION');
        try {
            await this.db.run('DELETE FROM nodes_function WHERE file_path = $1', filePath);
            await this.db.run('DELETE FROM nodes_class WHERE file_path = $1', filePath);
            await this.db.run('DELETE FROM nodes_method WHERE file_path = $1', filePath);
            await this.db.run('DELETE FROM nodes_interface WHERE file_path = $1', filePath);
            await this.db.run('DELETE FROM nodes_type WHERE file_path = $1', filePath);
            await this.db.run('DELETE FROM nodes_variable WHERE file_path = $1', filePath);
            await this.db.run('DELETE FROM nodes_file WHERE path = $1', filePath);

            if (nodeIds.length > 0) {
                const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(', ');
                const edgeTables = [
                    'edges_calls',
                    'edges_imports',
                    'edges_extends',
                    'edges_implements',
                    'edges_contains',
                    'edges_flows_to',
                    'edges_reads',
                    'edges_writes',
                    'edges_returns',
                ];
                for (const table of edgeTables) {
                    await this.db.run(
                        `DELETE FROM ${table} WHERE source_id IN (${placeholders})`,
                        ...nodeIds,
                    );
                    await this.db.run(
                        `DELETE FROM ${table} WHERE target_id IN (${placeholders})`,
                        ...nodeIds,
                    );
                }
            }

            await this.db.exec('COMMIT');
        } catch (err) {
            await this.db.exec('ROLLBACK');
            throw err;
        }
    }

    async getNodeIdsForFile(filePath: string): Promise<string[]> {
        const rows = await this.db.all<IdRow>(
            `SELECT id FROM nodes_function WHERE file_path = $1
             UNION ALL
             SELECT id FROM nodes_class WHERE file_path = $1
             UNION ALL
             SELECT id FROM nodes_method WHERE file_path = $1
             UNION ALL
             SELECT id FROM nodes_interface WHERE file_path = $1
             UNION ALL
             SELECT id FROM nodes_type WHERE file_path = $1
             UNION ALL
             SELECT id FROM nodes_variable WHERE file_path = $1
             UNION ALL
             SELECT id FROM nodes_file WHERE path = $1`,
            filePath,
        );
        return rows.map((r) => r.id);
    }

    async getStats(): Promise<{
        files: number;
        functions: number;
        classes: number;
        methods: number;
        interfaces: number;
        types: number;
        variables: number;
        modules: number;
        calls: number;
        imports: number;
        extends: number;
        implements: number;
        contains: number;
    }> {
        const rows = await this.db.all<Record<string, number | bigint>>(
            `SELECT
                (SELECT COUNT(*) FROM nodes_file) as files,
                (SELECT COUNT(*) FROM nodes_function) as functions,
                (SELECT COUNT(*) FROM nodes_class) as classes,
                (SELECT COUNT(*) FROM nodes_method) as methods,
                (SELECT COUNT(*) FROM nodes_interface) as interfaces,
                (SELECT COUNT(*) FROM nodes_type) as types,
                (SELECT COUNT(*) FROM nodes_variable) as variables,
                (SELECT COUNT(*) FROM nodes_module) as modules,
                (SELECT COUNT(*) FROM edges_calls) as calls,
                (SELECT COUNT(*) FROM edges_imports) as imports,
                (SELECT COUNT(*) FROM edges_extends) as extends_count,
                (SELECT COUNT(*) FROM edges_implements) as implements_count,
                (SELECT COUNT(*) FROM edges_contains) as contains`,
        );
        const row = rows[0];
        return {
            files: Number(row.files),
            functions: Number(row.functions),
            classes: Number(row.classes),
            methods: Number(row.methods),
            interfaces: Number(row.interfaces),
            types: Number(row.types),
            variables: Number(row.variables),
            modules: Number(row.modules),
            calls: Number(row.calls),
            imports: Number(row.imports),
            extends: Number(row.extends_count),
            implements: Number(row.implements_count),
            contains: Number(row.contains),
        };
    }

    async getAllSymbols(): Promise<
        {
            id: string;
            name: string;
            filePath: string;
            lineStart: number;
            lineEnd: number;
            kind: string;
        }[]
    > {
        const rows = await this.db.all<SymbolRow>('SELECT * FROM symbols');
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            filePath: r.file_path,
            lineStart: r.line_start,
            lineEnd: r.line_end,
            kind: r.kind,
        }));
    }

    async getSymbolById(id: string): Promise<{
        id: string;
        name: string;
        filePath: string;
        lineStart: number;
        lineEnd: number;
        kind: string;
    } | null> {
        const rows = await this.db.all<SymbolRow>('SELECT * FROM symbols WHERE id = $1', id);
        if (rows.length === 0) return null;
        const r = rows[0];
        return {
            id: r.id,
            name: r.name,
            filePath: r.file_path,
            lineStart: r.line_start,
            lineEnd: r.line_end,
            kind: r.kind,
        };
    }

    async getSymbolTable(fileId: string): Promise<Map<string, SymbolTableEntry> | null> {
        const rows = await this.db.all<MetaRow>(
            'SELECT * FROM cortex_meta WHERE key = $1',
            `symbol_table:${fileId}`,
        );
        if (rows.length === 0) return null;
        const entries: [string, SymbolTableEntry][] = JSON.parse(rows[0].value);
        return new Map(entries);
    }

    async setSymbolTable(fileId: string, table: Map<string, SymbolTableEntry>): Promise<void> {
        const serialized = JSON.stringify([...table.entries()]);
        await this.db.run(
            `INSERT OR REPLACE INTO cortex_meta (key, value) VALUES ($1, $2)`,
            `symbol_table:${fileId}`,
            serialized,
        );
    }

    private async batchInsert<T>(
        items: T[],
        colCount: number,
        mapItem: (item: T, offset: number) => { placeholder: string; params: unknown[] },
        sqlPrefix: string,
    ): Promise<void> {
        await this.db.exec('BEGIN TRANSACTION');
        try {
            for (let i = 0; i < items.length; i += CHUNK_SIZE) {
                const chunk = items.slice(i, i + CHUNK_SIZE);
                const placeholders: string[] = [];
                const params: unknown[] = [];
                for (let j = 0; j < chunk.length; j++) {
                    const offset = j * colCount;
                    const mapped = mapItem(chunk[j], offset);
                    placeholders.push(mapped.placeholder);
                    params.push(...mapped.params);
                }
                await this.db.run(`${sqlPrefix} ${placeholders.join(', ')}`, ...params);
            }
            await this.db.exec('COMMIT');
        } catch (err) {
            await this.db.exec('ROLLBACK');
            throw err;
        }
    }

    private mapFileNodeRow(row: FileNodeRow): FileNode {
        return {
            id: row.id,
            path: row.path,
            hash: row.hash,
            language: row.language,
            depthLevel: row.depth_level,
            lastIndexed: row.last_indexed ? new Date(row.last_indexed) : null,
        };
    }

    private mapFunctionNodeRow(row: FunctionNodeRow): FunctionNode {
        return {
            id: row.id,
            name: row.name,
            qualifiedName: row.qualified_name,
            filePath: row.file_path,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            isAsync: row.is_async,
            isExported: row.is_exported,
            isEntryPoint: row.is_entry_point,
            entryPointScore: row.entry_point_score,
            signature: row.signature,
            community: row.community,
            pageRank: row.page_rank,
            betweenness: row.betweenness,
        };
    }

    private mapClassNodeRow(row: ClassNodeRow): ClassNode {
        return {
            id: row.id,
            name: row.name,
            filePath: row.file_path,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            isAbstract: row.is_abstract,
            isExported: row.is_exported,
            community: row.community,
            pageRank: row.page_rank,
            betweenness: row.betweenness,
        };
    }

    private mapMethodNodeRow(row: MethodNodeRow): MethodNode {
        return {
            id: row.id,
            name: row.name,
            className: row.class_name,
            qualifiedName: row.qualified_name,
            filePath: row.file_path,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            visibility: row.visibility,
            isStatic: row.is_static,
            isAsync: row.is_async,
            community: row.community,
            pageRank: row.page_rank,
            betweenness: row.betweenness,
        };
    }

    private mapInterfaceNodeRow(row: InterfaceNodeRow): InterfaceNode {
        return {
            id: row.id,
            name: row.name,
            filePath: row.file_path,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            isExported: row.is_exported,
        };
    }

    private mapTypeNodeRow(row: TypeNodeRow): TypeNode {
        return {
            id: row.id,
            name: row.name,
            kind: row.kind,
            filePath: row.file_path,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            isExported: row.is_exported,
        };
    }

    private mapVariableNodeRow(row: VariableNodeRow): VariableNode {
        return {
            id: row.id,
            name: row.name,
            scope: row.scope,
            filePath: row.file_path,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            isExported: row.is_exported,
            inferredType: row.inferred_type,
        };
    }

    private mapModuleNodeRow(row: ModuleNodeRow): ModuleNode {
        return {
            id: row.id,
            path: row.path,
            isBarrel: row.is_barrel,
        };
    }

    private mapCallsEdgeRow(row: CallsEdgeRow): CallsEdge {
        return {
            sourceId: row.source_id,
            targetId: row.target_id,
            line: row.line,
            confidence: row.confidence,
            isDynamic: row.is_dynamic,
            isAsync: row.is_async,
            isIndirect: row.is_indirect,
            stage: row.stage,
            reason: row.reason,
        };
    }

    private mapImportsEdgeRow(row: ImportsEdgeRow): ImportsEdge {
        return {
            sourceId: row.source_id,
            targetId: row.target_id,
            line: row.line,
            kind: row.kind as ImportsEdge['kind'],
            originalName: row.original_name,
            alias: row.alias,
            confidence: row.confidence,
            stage: row.stage,
            reason: row.reason,
        };
    }

    private mapImplementsEdgeRow(row: ImplementsEdgeRow): ImplementsEdge {
        return {
            sourceId: row.source_id,
            targetId: row.target_id,
            line: row.line,
            confidence: row.confidence,
            stage: row.stage,
            reason: row.reason,
        };
    }

    private mapContainsEdgeRow(row: ContainsEdgeRow): ContainsEdge {
        return {
            sourceId: row.source_id,
            targetId: row.target_id,
            confidence: row.confidence,
            stage: row.stage,
            reason: row.reason,
        };
    }
}
