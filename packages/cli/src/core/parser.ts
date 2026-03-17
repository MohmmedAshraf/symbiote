import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { detectLanguage, getGrammar } from './languages.js';
import type { NodeRecord, EdgeRecord } from '../storage/repository.js';

const require = createRequire(import.meta.url);
const Parser = require('tree-sitter');

export interface SymbolEntry {
    localName: string;
    originalName: string;
    sourcePath: string;
    resolvedSourcePath: string;
}

export interface ParseResult {
    filePath: string;
    language: string;
    nodes: NodeRecord[];
    edges: EdgeRecord[];
    symbolTable?: Map<string, SymbolEntry>;
}

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

export function parseFile(filePath: string, content?: string): ParseResult | null {
    if (!content && !fs.existsSync(filePath)) return null;

    const language = detectLanguage(filePath);
    if (!language) return null;

    const grammar = getGrammar(language);
    if (!grammar) return null;

    const source = content ?? fs.readFileSync(filePath, 'utf-8');
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(source);

    const nodes: NodeRecord[] = [];
    const edges: EdgeRecord[] = [];

    const lineCount = source.split('\n').length;
    nodes.push({
        id: `file:${filePath}`,
        type: 'file',
        name: path.basename(filePath),
        filePath,
        lineStart: 1,
        lineEnd: lineCount,
    });

    extractNodes(tree.rootNode, filePath, nodes);
    extractImports(tree.rootNode, filePath, edges);

    const symbolTable = buildSymbolTable(tree.rootNode, filePath);
    extractImportBindings(symbolTable, filePath, edges);
    extractCalls(tree.rootNode, filePath, nodes, symbolTable, edges);

    for (const node of nodes) {
        if (node.type !== 'file') {
            edges.push({
                sourceId: `file:${filePath}`,
                targetId: node.id,
                type: 'contains',
            });
        }
    }

    return { filePath, language, nodes, edges, symbolTable };
}

function extractNodes(root: SyntaxNode, filePath: string, nodes: NodeRecord[]): void {
    const cursor = root.walk();
    let reachedRoot = false;

    while (!reachedRoot) {
        const node = cursor.currentNode;

        if (
            node.type === 'function_declaration' ||
            node.type === 'function' ||
            node.type === 'arrow_function'
        ) {
            const name = getFunctionName(node);
            if (name) {
                nodes.push({
                    id: `fn:${filePath}:${name}`,
                    type: 'function',
                    name,
                    filePath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                });
            }
        }

        if (node.type === 'interface_declaration') {
            const name = node.childForFieldName('name')?.text;
            if (name) {
                nodes.push({
                    id: `interface:${filePath}:${name}`,
                    type: 'interface',
                    name,
                    filePath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                });
            }
        }

        if (node.type === 'type_alias_declaration') {
            const name = node.childForFieldName('name')?.text;
            if (name) {
                nodes.push({
                    id: `type:${filePath}:${name}`,
                    type: 'type_alias',
                    name,
                    filePath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                });
            }
        }

        if (node.type === 'enum_declaration') {
            const name = node.childForFieldName('name')?.text;
            if (name) {
                nodes.push({
                    id: `enum:${filePath}:${name}`,
                    type: 'enum',
                    name,
                    filePath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                });
            }
        }

        if (node.type === 'class_declaration' || node.type === 'class') {
            const name = getClassName(node);
            if (name) {
                nodes.push({
                    id: `class:${filePath}:${name}`,
                    type: 'class',
                    name,
                    filePath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                });

                extractMethods(node, filePath, name, nodes);
            }
        }

        if (cursor.gotoFirstChild()) continue;
        if (cursor.gotoNextSibling()) continue;

        while (true) {
            if (!cursor.gotoParent()) {
                reachedRoot = true;
                break;
            }
            if (cursor.gotoNextSibling()) break;
        }
    }
}

function extractMethods(
    classNode: SyntaxNode,
    filePath: string,
    className: string,
    nodes: NodeRecord[],
): void {
    const body = classNode.childForFieldName('body');
    if (!body) return;

    for (const child of body.children) {
        if (child.type === 'method_definition' || child.type === 'public_field_definition') {
            const name = child.childForFieldName('name')?.text;
            if (name) {
                nodes.push({
                    id: `method:${filePath}:${className}.${name}`,
                    type: 'method',
                    name: `${className}.${name}`,
                    filePath,
                    lineStart: child.startPosition.row + 1,
                    lineEnd: child.endPosition.row + 1,
                });
            }
        }
    }
}

function extractImports(root: SyntaxNode, filePath: string, edges: EdgeRecord[]): void {
    for (const child of root.children) {
        if (child.type === 'import_statement') {
            const source = child.childForFieldName('source');
            if (source) {
                const importPath = source.text.replace(/['"]/g, '');
                edges.push({
                    sourceId: `file:${filePath}`,
                    targetId: `file:${resolveImportPath(filePath, importPath)}`,
                    type: 'imports',
                });
            }
        }
    }
}

function getFunctionName(node: SyntaxNode): string | null {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return nameNode.text;

    const parent = node.parent;
    if (parent?.type === 'variable_declarator') {
        const name = parent.childForFieldName('name');
        if (name) return name.text;
    }

    return null;
}

function getClassName(node: SyntaxNode): string | null {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text ?? null;
}

interface CallInfo {
    callerNodeId: string;
    calledName: string;
    isMethodCall: boolean;
    objectName?: string;
}

function extractCalls(
    root: SyntaxNode,
    filePath: string,
    nodes: NodeRecord[],
    symbolTable: Map<string, SymbolEntry>,
    edges: EdgeRecord[],
): void {
    const fnScopes = new Map(
        nodes
            .filter((n) => n.type === 'function' || n.type === 'method')
            .map((n) => [n.id, { lineStart: n.lineStart, lineEnd: n.lineEnd, id: n.id }]),
    );

    const cursor = root.walk();
    let done = false;
    while (!done) {
        const node = cursor.currentNode;
        if (node.type === 'call_expression') {
            const info = resolveCallExpression(node, filePath, fnScopes);
            if (info) {
                const targetId = resolveCallTarget(info, filePath, symbolTable);
                if (targetId) {
                    edges.push({ sourceId: info.callerNodeId, targetId, type: 'calls' });
                }
            }
        }
        if (node.type === 'new_expression') {
            const nameNode = node.childForFieldName('constructor');
            if (nameNode) {
                const caller = findEnclosingFunction(node, filePath, fnScopes);
                if (caller) {
                    const entry = symbolTable.get(nameNode.text);
                    const target = entry
                        ? `class:${entry.resolvedSourcePath}:${entry.originalName}`
                        : `class:${filePath}:${nameNode.text}`;
                    edges.push({ sourceId: caller, targetId: target, type: 'calls' });
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
}

function findEnclosingFunction(
    node: SyntaxNode,
    filePath: string,
    fnScopes: Map<string, { lineStart: number; lineEnd: number; id: string }>,
): string | null {
    const line = node.startPosition.row + 1;
    let best: string | null = null;
    let bestSize = Infinity;
    for (const [, fn] of fnScopes) {
        if (line >= fn.lineStart && line <= fn.lineEnd) {
            const size = fn.lineEnd - fn.lineStart;
            if (size < bestSize) {
                bestSize = size;
                best = fn.id;
            }
        }
    }
    return best ?? `file:${filePath}`;
}

function resolveCallExpression(
    node: SyntaxNode,
    filePath: string,
    fnScopes: Map<string, { lineStart: number; lineEnd: number; id: string }>,
): CallInfo | null {
    const fnField = node.childForFieldName('function');
    if (!fnField) return null;
    const callerNodeId = findEnclosingFunction(node, filePath, fnScopes);
    if (!callerNodeId) return null;

    if (fnField.type === 'member_expression') {
        const property = fnField.childForFieldName('property');
        if (!property) return null;
        return {
            callerNodeId,
            calledName: property.text,
            isMethodCall: true,
            objectName: fnField.childForFieldName('object')?.text,
        };
    }
    if (fnField.type === 'identifier') {
        return { callerNodeId, calledName: fnField.text, isMethodCall: false };
    }
    return null;
}

function resolveCallTarget(
    call: CallInfo,
    filePath: string,
    symbolTable: Map<string, SymbolEntry>,
): string | null {
    if (call.isMethodCall && call.objectName) {
        const entry = symbolTable.get(call.objectName);
        if (entry) {
            return `method:${entry.resolvedSourcePath}:${entry.originalName}.${call.calledName}`;
        }
        return `method:${filePath}:${call.objectName}.${call.calledName}`;
    }
    const entry = symbolTable.get(call.calledName);
    if (entry) return `fn:${entry.resolvedSourcePath}:${entry.originalName}`;
    return `fn:${filePath}:${call.calledName}`;
}

function buildSymbolTable(root: SyntaxNode, filePath: string): Map<string, SymbolEntry> {
    const table = new Map<string, SymbolEntry>();

    for (const child of root.children) {
        if (child.type !== 'import_statement') continue;
        const source = child.childForFieldName('source');
        if (!source) continue;

        const importPath = source.text.replace(/['"]/g, '');
        const resolvedPath = resolveImportPath(filePath, importPath);
        const importClause = child.children.find((c) => c.type === 'import_clause');
        if (!importClause) continue;

        for (const clause of importClause.children) {
            if (clause.type === 'named_imports') {
                for (const spec of clause.children) {
                    if (spec.type !== 'import_specifier') continue;
                    const nameNode = spec.childForFieldName('name');
                    const aliasNode = spec.childForFieldName('alias');
                    if (!nameNode) continue;
                    const originalName = nameNode.text;
                    const localName = aliasNode?.text ?? originalName;
                    table.set(localName, {
                        localName,
                        originalName,
                        sourcePath: importPath,
                        resolvedSourcePath: resolvedPath,
                    });
                }
            }
            if (clause.type === 'identifier') {
                table.set(clause.text, {
                    localName: clause.text,
                    originalName: 'default',
                    sourcePath: importPath,
                    resolvedSourcePath: resolvedPath,
                });
            }
        }
    }
    return table;
}

function extractImportBindings(
    symbolTable: Map<string, SymbolEntry>,
    filePath: string,
    edges: EdgeRecord[],
): void {
    for (const [, entry] of symbolTable) {
        const prefix = guessNodePrefix(entry.originalName);
        edges.push({
            sourceId: `file:${filePath}`,
            targetId: `${prefix}:${entry.resolvedSourcePath}:${entry.originalName}`,
            type: 'imports_symbol',
        });
    }
}

function guessNodePrefix(name: string): string {
    if (name === 'default') return 'fn';
    if (name[0] === name[0].toUpperCase() && !name.includes('_')) return 'class';
    return 'fn';
}

function resolveImportPath(fromFile: string, importPath: string): string {
    if (!importPath.startsWith('.')) return importPath;
    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, importPath);

    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

    if (fs.existsSync(resolved)) return resolved;

    for (const ext of extensions) {
        const withExt = resolved + ext;
        if (fs.existsSync(withExt)) return withExt;
    }

    const stripped = resolved.replace(/\.js$/, '.ts');
    if (stripped !== resolved && fs.existsSync(stripped)) return stripped;

    return resolved;
}
