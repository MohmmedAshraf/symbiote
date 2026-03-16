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

export function parseFile(filePath: string): ParseResult | null {
    if (!fs.existsSync(filePath)) return null;

    const language = detectLanguage(filePath);
    if (!language) return null;

    const grammar = getGrammar(language);
    if (!grammar) return null;

    const source = fs.readFileSync(filePath, 'utf-8');
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
    return path.resolve(dir, importPath);
}
