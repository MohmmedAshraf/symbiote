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
    FlowsToEdge,
    ReadsEdge,
    WritesEdge,
    ReturnsEdge,
    TypeConstraint,
    GenericInstantiation,
    SymbolTableEntry,
} from './types.js';
import type { ExecutionFlow, TemporalSnapshot } from './topology-types.js';

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

interface FlowsToEdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
    parameter_index: number | null;
    transform: string | null;
    taint_label: string | null;
    confidence: number;
    stage: number;
    reason: string | null;
}

interface ReadsEdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
    line: number | null;
    field: string | null;
    confidence: number;
    stage: number;
    reason: string | null;
}

interface WritesEdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
    line: number | null;
    field: string | null;
    confidence: number;
    stage: number;
    reason: string | null;
}

interface ReturnsEdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
    line: number | null;
    return_type: string | null;
    confidence: number;
    stage: number;
    reason: string | null;
}

interface TypeConstraintRow extends Record<string, unknown> {
    symbol_id: string;
    type_name: string;
    source: string;
    confidence: number;
    file_path: string;
    line: number;
}

interface GenericInstantiationRow extends Record<string, unknown> {
    symbol_id: string;
    generic_name: string;
    type_arguments: string[];
    file_path: string;
    line: number;
}

interface CortexFlowRow extends Record<string, unknown> {
    id: string;
    name: string;
    entry_point_id: string;
    node_ids: string[];
    has_async: boolean;
    has_error_path: boolean;
}

interface TemporalSnapshotRow extends Record<string, unknown> {
    commit_hash: string;
    timestamp: string;
    node_counts: string;
    edge_counts: string;
    community_hash: string;
    top_pagerank: string;
    hotspot_rankings: string;
}

interface NodeMetricsUpdate {
    nodeId: string;
    community: number;
    pageRank: number;
    betweenness: number;
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

    async deleteCallEdgesBySourceIds(sourceIds: string[]): Promise<void> {
        if (sourceIds.length === 0) return;
        const placeholders = sourceIds.map((_, i) => `$${i + 1}`).join(', ');
        await this.db.run(
            `DELETE FROM edges_calls WHERE source_id IN (${placeholders})`,
            ...sourceIds,
        );
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

    async insertTypeConstraints(constraints: TypeConstraint[]): Promise<void> {
        if (constraints.length === 0) return;
        await this.batchInsert(
            constraints,
            6,
            (c, offset) => ({
                placeholder: `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`,
                params: [c.symbolId, c.typeName, c.source, c.confidence, c.filePath, c.line],
            }),
            `INSERT OR IGNORE INTO type_constraints (symbol_id, type_name, source, confidence, file_path, line) VALUES`,
        );
    }

    async getTypeConstraints(symbolId: string): Promise<TypeConstraint[]> {
        const rows = await this.db.all<TypeConstraintRow>(
            'SELECT * FROM type_constraints WHERE symbol_id = $1',
            symbolId,
        );
        return rows.map(this.mapTypeConstraintRow);
    }

    async getTypeConstraintsByType(typeName: string): Promise<TypeConstraint[]> {
        const rows = await this.db.all<TypeConstraintRow>(
            'SELECT * FROM type_constraints WHERE type_name = $1',
            typeName,
        );
        return rows.map(this.mapTypeConstraintRow);
    }

    async deleteTypeConstraintsForFile(filePath: string): Promise<void> {
        await this.db.run('DELETE FROM type_constraints WHERE file_path = $1', filePath);
    }

    async insertGenericInstantiations(insts: GenericInstantiation[]): Promise<void> {
        if (insts.length === 0) return;
        await this.db.exec('BEGIN TRANSACTION');
        try {
            for (const inst of insts) {
                const listLiteral = `[${inst.typeArguments.map((a) => `'${a.replace(/'/g, "''")}'`).join(', ')}]`;
                await this.db.run(
                    `INSERT INTO generic_instantiations (symbol_id, generic_name, type_arguments, file_path, line)
                     VALUES ($1, $2, ${listLiteral}::VARCHAR[], $3, $4)`,
                    inst.symbolId,
                    inst.genericName,
                    inst.filePath,
                    inst.line,
                );
            }
            await this.db.exec('COMMIT');
        } catch (err) {
            await this.db.exec('ROLLBACK');
            throw err;
        }
    }

    async getGenericInstantiations(symbolId: string): Promise<GenericInstantiation[]> {
        const rows = await this.db.all<GenericInstantiationRow>(
            'SELECT * FROM generic_instantiations WHERE symbol_id = $1',
            symbolId,
        );
        return rows.map(this.mapGenericInstantiationRow);
    }

    async deleteGenericInstantiationsForFile(filePath: string): Promise<void> {
        await this.db.run('DELETE FROM generic_instantiations WHERE file_path = $1', filePath);
    }

    async getFlowsFrom(sourceId: string): Promise<FlowsToEdge[]> {
        const rows = await this.db.all<FlowsToEdgeRow>(
            'SELECT * FROM edges_flows_to WHERE source_id = $1',
            sourceId,
        );
        return rows.map(this.mapFlowsToEdgeRow);
    }

    async getFlowsTo(targetId: string): Promise<FlowsToEdge[]> {
        const rows = await this.db.all<FlowsToEdgeRow>(
            'SELECT * FROM edges_flows_to WHERE target_id = $1',
            targetId,
        );
        return rows.map(this.mapFlowsToEdgeRow);
    }

    async getReadsFrom(sourceId: string): Promise<ReadsEdge[]> {
        const rows = await this.db.all<ReadsEdgeRow>(
            'SELECT * FROM edges_reads WHERE source_id = $1',
            sourceId,
        );
        return rows.map(this.mapReadsEdgeRow);
    }

    async getReadsOf(targetId: string): Promise<ReadsEdge[]> {
        const rows = await this.db.all<ReadsEdgeRow>(
            'SELECT * FROM edges_reads WHERE target_id = $1',
            targetId,
        );
        return rows.map(this.mapReadsEdgeRow);
    }

    async getWritesFrom(sourceId: string): Promise<WritesEdge[]> {
        const rows = await this.db.all<WritesEdgeRow>(
            'SELECT * FROM edges_writes WHERE source_id = $1',
            sourceId,
        );
        return rows.map(this.mapWritesEdgeRow);
    }

    async getWritesTo(targetId: string): Promise<WritesEdge[]> {
        const rows = await this.db.all<WritesEdgeRow>(
            'SELECT * FROM edges_writes WHERE target_id = $1',
            targetId,
        );
        return rows.map(this.mapWritesEdgeRow);
    }

    async getReturnsFrom(sourceId: string): Promise<ReturnsEdge[]> {
        const rows = await this.db.all<ReturnsEdgeRow>(
            'SELECT * FROM edges_returns WHERE source_id = $1',
            sourceId,
        );
        return rows.map(this.mapReturnsEdgeRow);
    }

    async getReturnsTo(targetId: string): Promise<ReturnsEdge[]> {
        const rows = await this.db.all<ReturnsEdgeRow>(
            'SELECT * FROM edges_returns WHERE target_id = $1',
            targetId,
        );
        return rows.map(this.mapReturnsEdgeRow);
    }

    async getImplementorsOf(interfaceId: string): Promise<ImplementsEdge[]> {
        const rows = await this.db.all<ImplementsEdgeRow>(
            'SELECT * FROM edges_implements WHERE target_id = $1',
            interfaceId,
        );
        return rows.map(this.mapImplementsEdgeRow);
    }

    async updateCallEdgeConfidence(
        sourceId: string,
        targetId: string,
        confidence: number,
        reason: string,
    ): Promise<void> {
        await this.db.run(
            'UPDATE edges_calls SET confidence = $3, reason = $4 WHERE source_id = $1 AND target_id = $2',
            sourceId,
            targetId,
            confidence,
            reason,
        );
    }

    async updateCallEdgeAsync(sourceId: string, targetId: string, isAsync: boolean): Promise<void> {
        await this.db.run(
            'UPDATE edges_calls SET is_async = $3 WHERE source_id = $1 AND target_id = $2',
            sourceId,
            targetId,
            isAsync,
        );
    }

    async updateEntryPointScore(
        functionId: string,
        score: number,
        isEntryPoint: boolean,
    ): Promise<void> {
        await this.db.run(
            'UPDATE nodes_function SET entry_point_score = $2, is_entry_point = $3 WHERE id = $1',
            functionId,
            score,
            isEntryPoint,
        );
    }

    async updateVariableType(variableId: string, inferredType: string): Promise<void> {
        await this.db.run(
            'UPDATE nodes_variable SET inferred_type = $2 WHERE id = $1',
            variableId,
            inferredType,
        );
    }

    async deleteFlowEdgesForFile(filePath: string): Promise<void> {
        const nodeIds = await this.getNodeIdsForFile(filePath);
        if (nodeIds.length === 0) return;
        const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(', ');
        const flowTables = ['edges_flows_to', 'edges_reads', 'edges_writes', 'edges_returns'];
        for (const table of flowTables) {
            await this.db.run(
                `DELETE FROM ${table} WHERE source_id IN (${placeholders})`,
                ...nodeIds,
            );
        }
    }

    async deleteStageEdges(stage: number, filePath?: string): Promise<void> {
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
        if (filePath) {
            const nodeIds = await this.getNodeIdsForFile(filePath);
            if (nodeIds.length === 0) return;
            const placeholders = nodeIds.map((_, i) => `$${i + 2}`).join(', ');
            for (const table of edgeTables) {
                await this.db.run(
                    `DELETE FROM ${table} WHERE stage = $1 AND source_id IN (${placeholders})`,
                    stage,
                    ...nodeIds,
                );
            }
        } else {
            for (const table of edgeTables) {
                await this.db.run(`DELETE FROM ${table} WHERE stage = $1`, stage);
            }
        }
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
        flowsTo: number;
        reads: number;
        writes: number;
        returns: number;
        typeConstraints: number;
        genericInstantiations: number;
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
                (SELECT COUNT(*) FROM edges_contains) as contains,
                (SELECT COUNT(*) FROM edges_flows_to) as flows_to,
                (SELECT COUNT(*) FROM edges_reads) as reads,
                (SELECT COUNT(*) FROM edges_writes) as writes,
                (SELECT COUNT(*) FROM edges_returns) as returns,
                (SELECT COUNT(*) FROM type_constraints) as type_constraints,
                (SELECT COUNT(*) FROM generic_instantiations) as generic_instantiations`,
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
            flowsTo: Number(row.flows_to),
            reads: Number(row.reads),
            writes: Number(row.writes),
            returns: Number(row.returns),
            typeConstraints: Number(row.type_constraints),
            genericInstantiations: Number(row.generic_instantiations),
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

    async getSymbolByName(name: string): Promise<
        {
            id: string;
            name: string;
            filePath: string;
            lineStart: number;
            lineEnd: number;
            kind: string;
        }[]
    > {
        const rows = await this.db.all<SymbolRow>('SELECT * FROM symbols WHERE name = $1', name);
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            filePath: r.file_path,
            lineStart: r.line_start,
            lineEnd: r.line_end,
            kind: r.kind,
        }));
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

    async insertFlows(
        flows: Array<{
            id: string;
            name: string;
            entryPointId: string;
            nodeIds: string[];
            hasAsync: boolean;
            hasErrorPath: boolean;
        }>,
    ): Promise<void> {
        if (flows.length === 0) return;
        await this.db.exec('BEGIN TRANSACTION');
        try {
            for (const flow of flows) {
                const listLiteral = `[${flow.nodeIds.map((n) => `'${n.replace(/'/g, "''")}'`).join(', ')}]`;
                await this.db.run(
                    `INSERT OR REPLACE INTO cortex_flows (id, name, entry_point_id, node_ids, has_async, has_error_path)
                     VALUES ($1, $2, $3, ${listLiteral}::VARCHAR[], $4, $5)`,
                    flow.id,
                    flow.name,
                    flow.entryPointId,
                    flow.hasAsync,
                    flow.hasErrorPath,
                );
            }
            await this.db.exec('COMMIT');
        } catch (err) {
            await this.db.exec('ROLLBACK');
            throw err;
        }
    }

    async getFlowsByEntryPoint(entryPointId: string): Promise<
        Array<{
            id: string;
            name: string;
            entryPointId: string;
            nodeIds: string[];
            hasAsync: boolean;
            hasErrorPath: boolean;
        }>
    > {
        const rows = await this.db.all<CortexFlowRow>(
            'SELECT * FROM cortex_flows WHERE entry_point_id = $1',
            entryPointId,
        );
        return rows.map(this.mapCortexFlowRow);
    }

    async deleteFlowsForFile(filePath: string): Promise<void> {
        await this.db.run(
            `DELETE FROM cortex_flows WHERE entry_point_id LIKE 'fn:' || $1 || '%' OR entry_point_id LIKE 'method:' || $1 || '%'`,
            filePath,
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

    private mapFlowsToEdgeRow(row: FlowsToEdgeRow): FlowsToEdge {
        return {
            sourceId: row.source_id,
            targetId: row.target_id,
            parameterIndex: row.parameter_index,
            transform: row.transform as FlowsToEdge['transform'],
            taintLabel: row.taint_label,
            confidence: row.confidence,
            stage: row.stage,
            reason: row.reason,
        };
    }

    private mapReadsEdgeRow(row: ReadsEdgeRow): ReadsEdge {
        return {
            sourceId: row.source_id,
            targetId: row.target_id,
            line: row.line,
            field: row.field,
            confidence: row.confidence,
            stage: row.stage,
            reason: row.reason,
        };
    }

    private mapWritesEdgeRow(row: WritesEdgeRow): WritesEdge {
        return {
            sourceId: row.source_id,
            targetId: row.target_id,
            line: row.line,
            field: row.field,
            confidence: row.confidence,
            stage: row.stage,
            reason: row.reason,
        };
    }

    private mapReturnsEdgeRow(row: ReturnsEdgeRow): ReturnsEdge {
        return {
            sourceId: row.source_id,
            targetId: row.target_id,
            line: row.line,
            returnType: row.return_type,
            confidence: row.confidence,
            stage: row.stage,
            reason: row.reason,
        };
    }

    private mapTypeConstraintRow(row: TypeConstraintRow): TypeConstraint {
        return {
            symbolId: row.symbol_id,
            typeName: row.type_name,
            source: row.source as TypeConstraint['source'],
            confidence: row.confidence,
            filePath: row.file_path,
            line: row.line,
        };
    }

    private mapGenericInstantiationRow(row: GenericInstantiationRow): GenericInstantiation {
        const rawArgs = row.type_arguments;
        const typeArguments = Array.isArray(rawArgs)
            ? rawArgs
            : Array.from((rawArgs as { items: string[] }).items);
        return {
            symbolId: row.symbol_id,
            genericName: row.generic_name,
            typeArguments,
            filePath: row.file_path,
            line: row.line,
        };
    }

    // --- Single-item insert/get methods for topology tests ---

    async insertFunction(node: FunctionNode): Promise<void> {
        await this.insertFunctionNodes([node]);
    }

    async getFunction(id: string): Promise<FunctionNode | null> {
        const rows = await this.db.all<FunctionNodeRow>(
            'SELECT * FROM nodes_function WHERE id = $1',
            id,
        );
        if (rows.length === 0) return null;
        return this.mapFunctionNodeRow(rows[0]);
    }

    async insertClass(node: ClassNode): Promise<void> {
        await this.insertClassNodes([node]);
    }

    async getClass(id: string): Promise<ClassNode | null> {
        const rows = await this.db.all<ClassNodeRow>('SELECT * FROM nodes_class WHERE id = $1', id);
        if (rows.length === 0) return null;
        return this.mapClassNodeRow(rows[0]);
    }

    async insertMethod(node: MethodNode): Promise<void> {
        await this.insertMethodNodes([node]);
    }

    async getMethod(id: string): Promise<MethodNode | null> {
        const rows = await this.db.all<MethodNodeRow>(
            'SELECT * FROM nodes_method WHERE id = $1',
            id,
        );
        if (rows.length === 0) return null;
        return this.mapMethodNodeRow(rows[0]);
    }

    async insertFileNode(node: {
        id: string;
        path: string;
        extension: string;
        language: string;
        depthLevel: number;
    }): Promise<void> {
        await this.upsertFileNode({
            id: node.id,
            path: node.path,
            hash: null,
            language: node.language,
            depthLevel: node.depthLevel,
            lastIndexed: null,
        });
    }

    // --- Topology write-back methods ---

    async updateNodeMetrics(
        nodeId: string,
        metrics: { community: number; pageRank: number; betweenness: number },
    ): Promise<void> {
        const table = this.nodeTableForId(nodeId);
        if (!table) return;
        await this.db.run(
            `UPDATE ${table} SET community = $1, page_rank = $2, betweenness = $3 WHERE id = $4`,
            metrics.community,
            metrics.pageRank,
            metrics.betweenness,
            nodeId,
        );
    }

    async updateNodeMetricsBatch(updates: NodeMetricsUpdate[]): Promise<void> {
        for (const update of updates) {
            await this.updateNodeMetrics(update.nodeId, update);
        }
    }

    // --- Generic meta CRUD ---

    async getMeta(key: string): Promise<string | null> {
        const rows = await this.db.all<MetaRow>('SELECT * FROM cortex_meta WHERE key = $1', key);
        if (rows.length === 0) return null;
        return rows[0].value;
    }

    async setMeta(key: string, value: string): Promise<void> {
        await this.db.run(
            'INSERT OR REPLACE INTO cortex_meta (key, value) VALUES ($1, $2)',
            key,
            value,
        );
    }

    // --- Topology queries ---

    async getMaxDepthLevel(): Promise<number> {
        const rows = await this.db.all<Record<string, unknown>>(
            'SELECT MAX(depth_level) as max_depth FROM nodes_file',
        );
        if (rows.length === 0) return 0;
        return Number(rows[0].max_depth) || 0;
    }

    async getAllFunctions(): Promise<FunctionNode[]> {
        const rows = await this.db.all<FunctionNodeRow>('SELECT * FROM nodes_function');
        return rows.map((r) => this.mapFunctionNodeRow(r));
    }

    async getAllClasses(): Promise<ClassNode[]> {
        const rows = await this.db.all<ClassNodeRow>('SELECT * FROM nodes_class');
        return rows.map((r) => this.mapClassNodeRow(r));
    }

    async getAllMethods(): Promise<MethodNode[]> {
        const rows = await this.db.all<MethodNodeRow>('SELECT * FROM nodes_method');
        return rows.map((r) => this.mapMethodNodeRow(r));
    }

    // --- Single-item flow CRUD ---

    async insertFlow(flow: ExecutionFlow): Promise<void> {
        await this.insertFlows([flow]);
    }

    async getFlow(id: string): Promise<ExecutionFlow | null> {
        const rows = await this.db.all<CortexFlowRow>(
            'SELECT * FROM cortex_flows WHERE id = $1',
            id,
        );
        if (rows.length === 0) return null;
        return this.mapCortexFlowRow(rows[0]) as ExecutionFlow;
    }

    async getAllFlows(): Promise<ExecutionFlow[]> {
        const rows = await this.db.all<CortexFlowRow>('SELECT * FROM cortex_flows');
        return rows.map((r) => this.mapCortexFlowRow(r) as ExecutionFlow);
    }

    async deleteAllFlows(): Promise<void> {
        await this.db.run('DELETE FROM cortex_flows');
    }

    // --- Temporal snapshot CRUD ---

    async insertTemporalSnapshot(snapshot: TemporalSnapshot): Promise<void> {
        await this.db.run(
            `INSERT INTO cortex_temporal_snapshots
             (commit_hash, timestamp, node_counts, edge_counts, community_hash, top_pagerank, hotspot_rankings)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            snapshot.commitHash,
            snapshot.timestamp.toISOString(),
            JSON.stringify(snapshot.nodeCounts),
            JSON.stringify(snapshot.edgeCounts),
            snapshot.communityHash,
            JSON.stringify(snapshot.topPagerank),
            JSON.stringify(snapshot.hotspotRankings),
        );
    }

    async getTemporalSnapshots(limit: number): Promise<TemporalSnapshot[]> {
        const rows = await this.db.all<TemporalSnapshotRow>(
            'SELECT * FROM cortex_temporal_snapshots ORDER BY timestamp DESC LIMIT $1',
            limit,
        );
        return rows.map((r) => this.mapSnapshotRow(r));
    }

    // --- Private helpers ---

    private nodeTableForId(nodeId: string): string | null {
        if (nodeId.startsWith('fn:')) return 'nodes_function';
        if (nodeId.startsWith('class:')) return 'nodes_class';
        if (nodeId.startsWith('method:')) return 'nodes_method';
        if (nodeId.startsWith('iface:')) return 'nodes_interface';
        if (nodeId.startsWith('type:')) return 'nodes_type';
        if (nodeId.startsWith('var:')) return 'nodes_variable';
        if (nodeId.startsWith('file:')) return 'nodes_file';
        if (nodeId.startsWith('module:')) return 'nodes_module';
        return null;
    }

    private mapCortexFlowRow(row: CortexFlowRow): {
        id: string;
        name: string;
        entryPointId: string;
        nodeIds: string[];
        hasAsync: boolean;
        hasErrorPath: boolean;
    } {
        const rawIds = row.node_ids;
        const nodeIds = Array.isArray(rawIds)
            ? rawIds
            : Array.from((rawIds as { items: string[] }).items);
        return {
            id: row.id,
            name: row.name,
            entryPointId: row.entry_point_id,
            nodeIds,
            hasAsync: row.has_async,
            hasErrorPath: row.has_error_path,
        };
    }

    private mapSnapshotRow(row: TemporalSnapshotRow): TemporalSnapshot {
        return {
            commitHash: row.commit_hash,
            timestamp: new Date(row.timestamp),
            nodeCounts:
                typeof row.node_counts === 'string'
                    ? JSON.parse(row.node_counts)
                    : (row.node_counts as Record<string, number>),
            edgeCounts:
                typeof row.edge_counts === 'string'
                    ? JSON.parse(row.edge_counts)
                    : (row.edge_counts as Record<string, number>),
            communityHash: row.community_hash,
            topPagerank:
                typeof row.top_pagerank === 'string'
                    ? JSON.parse(row.top_pagerank)
                    : (row.top_pagerank as Array<{ nodeId: string; score: number }>),
            hotspotRankings:
                typeof row.hotspot_rankings === 'string'
                    ? JSON.parse(row.hotspot_rankings)
                    : (row.hotspot_rankings as Array<{ nodeId: string; score: number }>),
        };
    }
}
