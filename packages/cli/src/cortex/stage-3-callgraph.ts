import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { getGrammar } from '../core/languages.js';
import { CortexRepository } from './repository.js';
import type {
    StageResult,
    StageError,
    CallsEdge,
    FunctionNode,
    MethodNode,
    SymbolTableEntry,
} from './types.js';

const cjsRequire = createRequire(import.meta.url);
const Parser = cjsRequire('tree-sitter');

interface SyntaxNode {
    type: string;
    text: string;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
    parent: SyntaxNode | null;
    children: SyntaxNode[];
    childForFieldName(name: string): SyntaxNode | null;
    walk(): TreeCursor;
}

interface TreeCursor {
    currentNode: SyntaxNode;
    gotoFirstChild(): boolean;
    gotoNextSibling(): boolean;
    gotoParent(): boolean;
}

interface ScopeEntry {
    id: string;
    lineStart: number;
    lineEnd: number;
}

const CALL_TYPES = new Set(['call_expression', 'new_expression']);

export async function runStage3(
    repo: CortexRepository,
    rootDir: string,
    options?: { force?: boolean; targetFiles?: string[] },
): Promise<StageResult> {
    const start = Date.now();
    const errors: StageError[] = [];
    let filesProcessed = 0;
    let edgesCreated = 0;

    const files = options?.force ? await repo.getAllFileNodes() : await repo.getFilesByMaxDepth(3);

    const targetSet = options?.targetFiles ? new Set(options.targetFiles) : null;

    for (const file of files) {
        if (targetSet && !targetSet.has(file.path)) continue;
        if (!file.language) continue;
        if (!isJsTs(file.language)) continue;

        const absPath = resolve(rootDir, file.path);
        let content: string;
        try {
            content = readFileSync(absPath, 'utf-8');
        } catch (err) {
            errors.push({
                filePath: file.path,
                stage: 3,
                message: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        const grammar = getGrammar(file.language);
        if (!grammar) continue;

        const fileId = `file:${file.path}`;

        const functions = await repo.getFunctionsByFile(file.path);
        const methods = await repo.getMethodsByFile(file.path);
        const scopeMap = buildScopeMap(functions, methods);

        const symbolTable = await repo.getSymbolTable(fileId);

        let edges: CallsEdge[];
        try {
            edges = extractCallEdges(content, grammar, file.path, scopeMap, symbolTable);
        } catch (err) {
            errors.push({
                filePath: file.path,
                stage: 3,
                message: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        const nodeIds = [...functions.map((f) => f.id), ...methods.map((m) => m.id)];
        if (nodeIds.length > 0) {
            await repo.deleteCallEdgesBySourceIds(nodeIds);
        }

        if (edges.length > 0) {
            await repo.insertCallsEdges(edges);
            edgesCreated += edges.length;
        }

        await repo.upsertFileNode({ ...file, depthLevel: 3 });
        filesProcessed++;
    }

    return {
        stage: 3,
        filesProcessed,
        nodesCreated: 0,
        edgesCreated,
        durationMs: Date.now() - start,
        errors,
    };
}

function isJsTs(language: string): boolean {
    return language === 'javascript' || language === 'typescript' || language === 'tsx';
}

function buildScopeMap(functions: FunctionNode[], methods: MethodNode[]): ScopeEntry[] {
    const entries: ScopeEntry[] = [];
    for (const fn of functions) {
        entries.push({ id: fn.id, lineStart: fn.lineStart, lineEnd: fn.lineEnd });
    }
    for (const m of methods) {
        entries.push({ id: m.id, lineStart: m.lineStart, lineEnd: m.lineEnd });
    }
    return entries;
}

function findEnclosingScope(line: number, scopeMap: ScopeEntry[]): string | null {
    let best: string | null = null;
    let bestSize = Infinity;
    for (const entry of scopeMap) {
        if (line >= entry.lineStart && line <= entry.lineEnd) {
            const size = entry.lineEnd - entry.lineStart;
            if (size < bestSize) {
                bestSize = size;
                best = entry.id;
            }
        }
    }
    return best;
}

function extractCallEdges(
    content: string,
    grammar: unknown,
    relPath: string,
    scopeMap: ScopeEntry[],
    symbolTable: Map<string, SymbolTableEntry> | null,
): CallsEdge[] {
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(content);
    const root: SyntaxNode = tree.rootNode;

    const varTypes = scanVariableTypes(root, relPath, symbolTable);
    const edges: CallsEdge[] = [];

    const cursor: TreeCursor = root.walk();
    let done = false;

    while (!done) {
        const node: SyntaxNode = cursor.currentNode;

        if (CALL_TYPES.has(node.type)) {
            const edge = processCallNode(node, relPath, scopeMap, symbolTable, varTypes);
            if (edge) {
                edges.push(edge);
            }
        }

        if (cursor.gotoFirstChild()) continue;
        if (cursor.gotoNextSibling()) continue;

        while (true) {
            if (!cursor.gotoParent()) {
                done = true;
                break;
            }
            if (cursor.gotoNextSibling()) break;
        }
    }

    return edges;
}

function scanVariableTypes(
    root: SyntaxNode,
    relPath: string,
    symbolTable: Map<string, SymbolTableEntry> | null,
): Map<string, { className: string; sourcePath: string }> {
    const varTypes = new Map<string, { className: string; sourcePath: string }>();

    const cursor: TreeCursor = root.walk();
    let done = false;

    while (!done) {
        const node: SyntaxNode = cursor.currentNode;

        if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
            for (const child of node.children) {
                if (child.type === 'variable_declarator') {
                    const nameNode = child.childForFieldName('name');
                    const valueNode = child.childForFieldName('value');
                    if (nameNode && valueNode?.type === 'new_expression') {
                        const ctorNode =
                            valueNode.childForFieldName('constructor') ??
                            valueNode.children.find(
                                (c) => c.type === 'identifier' || c.type === 'type_identifier',
                            );
                        if (ctorNode) {
                            const className = ctorNode.text;
                            const entry = symbolTable?.get(className);
                            const sourcePath = entry ? entry.resolvedSourcePath : relPath;
                            varTypes.set(nameNode.text, { className, sourcePath });
                        }
                    }
                }
            }
        }

        if (cursor.gotoFirstChild()) continue;
        if (cursor.gotoNextSibling()) continue;

        while (true) {
            if (!cursor.gotoParent()) {
                done = true;
                break;
            }
            if (cursor.gotoNextSibling()) break;
        }
    }

    return varTypes;
}

function processCallNode(
    node: SyntaxNode,
    relPath: string,
    scopeMap: ScopeEntry[],
    symbolTable: Map<string, SymbolTableEntry> | null,
    varTypes: Map<string, { className: string; sourcePath: string }>,
): CallsEdge | null {
    const line = node.startPosition.row + 1;
    const sourceId = findEnclosingScope(line, scopeMap);
    if (!sourceId) return null;

    const isAwait = node.parent?.type === 'await_expression';
    const isIndirect = isCallbackUsage(node);

    if (node.type === 'new_expression') {
        return processNewExpression(
            node,
            relPath,
            sourceId,
            line,
            symbolTable,
            isAwait,
            isIndirect,
        );
    }

    return processCallExpression(
        node,
        relPath,
        sourceId,
        line,
        symbolTable,
        varTypes,
        isAwait,
        isIndirect,
    );
}

function processNewExpression(
    node: SyntaxNode,
    relPath: string,
    sourceId: string,
    line: number,
    symbolTable: Map<string, SymbolTableEntry> | null,
    isAsync: boolean,
    isIndirect: boolean,
): CallsEdge | null {
    const ctorNode =
        node.childForFieldName('constructor') ??
        node.children.find((c) => c.type === 'identifier' || c.type === 'type_identifier');
    if (!ctorNode) return null;

    const className = ctorNode.text;
    const entry = symbolTable?.get(className);

    if (entry) {
        return {
            sourceId,
            targetId: `class:${entry.resolvedSourcePath}:${entry.originalName}`,
            line,
            confidence: 0.95,
            isDynamic: false,
            isAsync,
            isIndirect,
            stage: 3,
            reason: 'constructor',
        };
    }

    return {
        sourceId,
        targetId: `class:${relPath}:${className}`,
        line,
        confidence: 0.7,
        isDynamic: false,
        isAsync,
        isIndirect,
        stage: 3,
        reason: 'constructor',
    };
}

function processCallExpression(
    node: SyntaxNode,
    relPath: string,
    sourceId: string,
    line: number,
    symbolTable: Map<string, SymbolTableEntry> | null,
    varTypes: Map<string, { className: string; sourcePath: string }>,
    isAsync: boolean,
    isIndirect: boolean,
): CallsEdge | null {
    const fnField = node.childForFieldName('function');
    if (!fnField) return null;

    const isDynamic = isComputedCall(fnField);

    if (fnField.type === 'member_expression') {
        return processMemberCall(
            fnField,
            relPath,
            sourceId,
            line,
            symbolTable,
            varTypes,
            isAsync,
            isIndirect,
            isDynamic,
        );
    }

    if (fnField.type === 'identifier') {
        return processDirectCall(
            fnField,
            relPath,
            sourceId,
            line,
            symbolTable,
            isAsync,
            isIndirect,
        );
    }

    return null;
}

function processMemberCall(
    fnField: SyntaxNode,
    relPath: string,
    sourceId: string,
    line: number,
    symbolTable: Map<string, SymbolTableEntry> | null,
    varTypes: Map<string, { className: string; sourcePath: string }>,
    isAsync: boolean,
    isIndirect: boolean,
    isDynamic: boolean,
): CallsEdge | null {
    const objectNode = fnField.childForFieldName('object');
    const propertyNode = fnField.childForFieldName('property');
    if (!objectNode || !propertyNode) return null;

    const objName = objectNode.text;
    const methodName = propertyNode.text;

    const varType = varTypes.get(objName);
    if (varType) {
        return {
            sourceId,
            targetId: `method:${varType.sourcePath}:${varType.className}.${methodName}`,
            line,
            confidence: 0.95,
            isDynamic,
            isAsync,
            isIndirect,
            stage: 3,
            reason: 'method call',
        };
    }

    const entry = symbolTable?.get(objName);
    if (entry) {
        return {
            sourceId,
            targetId: `method:${entry.resolvedSourcePath}:${entry.originalName}.${methodName}`,
            line,
            confidence: 0.95,
            isDynamic,
            isAsync,
            isIndirect,
            stage: 3,
            reason: 'method call',
        };
    }

    return {
        sourceId,
        targetId: `method:${relPath}:${objName}.${methodName}`,
        line,
        confidence: 0.5,
        isDynamic,
        isAsync,
        isIndirect,
        stage: 3,
        reason: 'method call',
    };
}

function processDirectCall(
    fnField: SyntaxNode,
    relPath: string,
    sourceId: string,
    line: number,
    symbolTable: Map<string, SymbolTableEntry> | null,
    isAsync: boolean,
    isIndirect: boolean,
): CallsEdge | null {
    const name = fnField.text;
    const entry = symbolTable?.get(name);

    if (entry) {
        return {
            sourceId,
            targetId: `fn:${entry.resolvedSourcePath}:${entry.originalName}`,
            line,
            confidence: 0.95,
            isDynamic: false,
            isAsync,
            isIndirect,
            stage: 3,
            reason: 'direct call',
        };
    }

    return {
        sourceId,
        targetId: `fn:${relPath}:${name}`,
        line,
        confidence: 0.7,
        isDynamic: false,
        isAsync,
        isIndirect,
        stage: 3,
        reason: 'direct call',
    };
}

function isComputedCall(fnField: SyntaxNode): boolean {
    if (fnField.type === 'subscript_expression') return true;
    if (fnField.type === 'member_expression') {
        const prop = fnField.childForFieldName('property');
        if (prop?.type === 'computed_property_name') return true;
    }
    return false;
}

function isCallbackUsage(node: SyntaxNode): boolean {
    const parent = node.parent;
    if (!parent) return false;
    if (parent.type === 'arguments') return true;
    return false;
}
