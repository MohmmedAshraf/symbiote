import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { detectLanguage, getGrammar } from './languages.js';
import type { NodeRecord, EdgeRecord } from '#storage/repository.js';

const cjsRequire = createRequire(import.meta.url);
const Parser = cjsRequire('tree-sitter');

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

interface LanguageConfig {
    functionTypes: Set<string>;
    classTypes: Set<string>;
    methodTypes: Set<string>;
    interfaceTypes: Set<string>;
    typeAliasTypes: Set<string>;
    enumTypes: Set<string>;
    importTypes: Set<string>;
    callTypes: Set<string>;
    importSourceField: string;
    extensions: string[];
}

const JS_TS_CONFIG: LanguageConfig = {
    functionTypes: new Set([
        'function_declaration',
        'function',
        'arrow_function',
        'generator_function',
        'generator_function_declaration',
    ]),
    classTypes: new Set(['class_declaration', 'class']),
    methodTypes: new Set(['method_definition', 'public_field_definition']),
    interfaceTypes: new Set(['interface_declaration']),
    typeAliasTypes: new Set(['type_alias_declaration']),
    enumTypes: new Set(['enum_declaration']),
    importTypes: new Set(['import_statement']),
    callTypes: new Set(['call_expression', 'new_expression']),
    importSourceField: 'source',
    extensions: [
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.mjs',
        '/index.ts',
        '/index.tsx',
        '/index.js',
        '/index.jsx',
    ],
};

const PYTHON_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_definition']),
    classTypes: new Set(['class_definition']),
    methodTypes: new Set(['function_definition']),
    interfaceTypes: new Set(),
    typeAliasTypes: new Set(),
    enumTypes: new Set(),
    importTypes: new Set(['import_statement', 'import_from_statement']),
    callTypes: new Set(['call']),
    importSourceField: 'module_name',
    extensions: ['.py', '/__init__.py'],
};

const GO_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_declaration', 'method_declaration']),
    classTypes: new Set(),
    methodTypes: new Set(),
    interfaceTypes: new Set(),
    typeAliasTypes: new Set(),
    enumTypes: new Set(),
    importTypes: new Set(['import_declaration']),
    callTypes: new Set(['call_expression']),
    importSourceField: 'path',
    extensions: ['.go'],
};

const RUST_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_item']),
    classTypes: new Set(['struct_item']),
    methodTypes: new Set(['function_item']),
    interfaceTypes: new Set(['trait_item']),
    typeAliasTypes: new Set(['type_item']),
    enumTypes: new Set(['enum_item']),
    importTypes: new Set(['use_declaration']),
    callTypes: new Set(['call_expression']),
    importSourceField: 'argument',
    extensions: ['.rs'],
};

const JAVA_CONFIG: LanguageConfig = {
    functionTypes: new Set(),
    classTypes: new Set(['class_declaration']),
    methodTypes: new Set(['method_declaration', 'constructor_declaration']),
    interfaceTypes: new Set(['interface_declaration']),
    typeAliasTypes: new Set(),
    enumTypes: new Set(['enum_declaration']),
    importTypes: new Set(['import_declaration']),
    callTypes: new Set(['method_invocation', 'object_creation_expression']),
    importSourceField: '',
    extensions: ['.java'],
};

const RUBY_CONFIG: LanguageConfig = {
    functionTypes: new Set(['method']),
    classTypes: new Set(['class', 'module']),
    methodTypes: new Set(['method', 'singleton_method']),
    interfaceTypes: new Set(),
    typeAliasTypes: new Set(),
    enumTypes: new Set(),
    importTypes: new Set(),
    callTypes: new Set(['call', 'method_call']),
    importSourceField: '',
    extensions: ['.rb'],
};

const PHP_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_definition']),
    classTypes: new Set(['class_declaration']),
    methodTypes: new Set(['method_declaration']),
    interfaceTypes: new Set(['interface_declaration']),
    typeAliasTypes: new Set(),
    enumTypes: new Set(['enum_declaration']),
    importTypes: new Set(['namespace_use_declaration']),
    callTypes: new Set(['function_call_expression', 'member_call_expression']),
    importSourceField: '',
    extensions: ['.php'],
};

const C_CPP_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_definition']),
    classTypes: new Set(['class_specifier']),
    methodTypes: new Set(['function_definition']),
    interfaceTypes: new Set(),
    typeAliasTypes: new Set(),
    enumTypes: new Set(),
    importTypes: new Set(['preproc_include']),
    callTypes: new Set(['call_expression']),
    importSourceField: 'path',
    extensions: ['.c', '.h', '.cpp', '.cc', '.hpp'],
};

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
    javascript: JS_TS_CONFIG,
    typescript: JS_TS_CONFIG,
    tsx: JS_TS_CONFIG,
    python: PYTHON_CONFIG,
    go: GO_CONFIG,
    rust: RUST_CONFIG,
    java: JAVA_CONFIG,
    ruby: RUBY_CONFIG,
    php: PHP_CONFIG,
    c: C_CPP_CONFIG,
    cpp: C_CPP_CONFIG,
};

const resolveCache = new Map<string, string>();

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

    const config = LANGUAGE_CONFIGS[language] ?? JS_TS_CONFIG;
    const nodes: NodeRecord[] = [];
    const edges: EdgeRecord[] = [];

    const lineCount = tree.rootNode.endPosition.row + 1;
    nodes.push({
        id: `file:${filePath}`,
        type: 'file',
        name: path.basename(filePath),
        filePath,
        lineStart: 1,
        lineEnd: lineCount,
    });

    extractNodes(tree.rootNode, filePath, language, config, nodes);
    extractImports(tree.rootNode, filePath, language, config, edges);

    const symbolTable = buildSymbolTable(tree.rootNode, filePath, language, config);
    extractImportBindings(symbolTable, filePath, edges);
    extractCalls(tree.rootNode, filePath, config, nodes, symbolTable, edges);

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

function extractNodes(
    root: SyntaxNode,
    filePath: string,
    language: string,
    config: LanguageConfig,
    nodes: NodeRecord[],
): void {
    const cursor = root.walk();
    let reachedRoot = false;

    while (!reachedRoot) {
        const node = cursor.currentNode;

        if (config.functionTypes.has(node.type)) {
            const insideClass = isInsideClass(node, config);
            if (!insideClass) {
                const name = getFunctionName(node, language);
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
        }

        if (config.interfaceTypes.has(node.type)) {
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

        if (config.typeAliasTypes.has(node.type)) {
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

        if (config.enumTypes.has(node.type)) {
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

        if (config.classTypes.has(node.type)) {
            const name = getClassName(node, language);
            if (name) {
                nodes.push({
                    id: `class:${filePath}:${name}`,
                    type: 'class',
                    name,
                    filePath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                });

                extractMethods(node, filePath, name, language, config, nodes);
            }
        }

        if ((language === 'c' || language === 'cpp') && node.type === 'type_definition') {
            const declarator = node.childForFieldName('declarator');
            if (declarator?.type === 'type_identifier') {
                const hasStruct = node.children.some((c) => c.type === 'struct_specifier');
                const hasEnum = node.children.some((c) => c.type === 'enum_specifier');
                const nodeType = hasStruct ? 'class' : hasEnum ? 'enum' : 'type_alias';
                const prefix = hasStruct ? 'class' : hasEnum ? 'enum' : 'type';
                nodes.push({
                    id: `${prefix}:${filePath}:${declarator.text}`,
                    type: nodeType,
                    name: declarator.text,
                    filePath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                });
            }
        }

        if (language === 'go' && node.type === 'type_declaration') {
            for (const spec of node.children) {
                if (spec.type === 'type_spec') {
                    const name = spec.childForFieldName('name')?.text;
                    const typeNode = spec.childForFieldName('type');
                    if (name && typeNode) {
                        if (typeNode.type === 'struct_type') {
                            nodes.push({
                                id: `class:${filePath}:${name}`,
                                type: 'class',
                                name,
                                filePath,
                                lineStart: spec.startPosition.row + 1,
                                lineEnd: spec.endPosition.row + 1,
                            });
                        } else if (typeNode.type === 'interface_type') {
                            nodes.push({
                                id: `interface:${filePath}:${name}`,
                                type: 'interface',
                                name,
                                filePath,
                                lineStart: spec.startPosition.row + 1,
                                lineEnd: spec.endPosition.row + 1,
                            });
                        }
                    }
                }
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

function isInsideClass(node: SyntaxNode, config: LanguageConfig): boolean {
    let parent = node.parent;
    while (parent) {
        if (config.classTypes.has(parent.type)) return true;
        if (parent.type === 'impl_item') return true;
        parent = parent.parent;
    }
    return false;
}

function extractMethods(
    classNode: SyntaxNode,
    filePath: string,
    className: string,
    language: string,
    config: LanguageConfig,
    nodes: NodeRecord[],
): void {
    const body = classNode.childForFieldName('body') ?? findClassBody(classNode);
    if (!body) return;

    for (const child of body.children) {
        if (config.methodTypes.has(child.type)) {
            const name = getFunctionName(child, language);
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

function findClassBody(node: SyntaxNode): SyntaxNode | null {
    for (const child of node.children) {
        if (
            child.type === 'class_body' ||
            child.type === 'block' ||
            child.type === 'declaration_list' ||
            child.type === 'field_declaration_list'
        ) {
            return child;
        }
    }
    return null;
}

function extractImports(
    root: SyntaxNode,
    filePath: string,
    language: string,
    config: LanguageConfig,
    edges: EdgeRecord[],
): void {
    for (const child of root.children) {
        if (!config.importTypes.has(child.type)) continue;

        if (language === 'go' && child.type === 'import_declaration') {
            const specs: SyntaxNode[] = [];
            for (const c of child.children) {
                if (c.type === 'import_spec') {
                    specs.push(c);
                } else if (c.type === 'import_spec_list') {
                    for (const s of c.children) {
                        if (s.type === 'import_spec') specs.push(s);
                    }
                }
            }
            for (const spec of specs) {
                const pathNode = spec.childForFieldName('path');
                if (pathNode) {
                    const importPath = pathNode.text.replace(/"/g, '');
                    edges.push({
                        sourceId: `file:${filePath}`,
                        targetId: `file:${resolveImportPath(filePath, importPath, config)}`,
                        type: 'imports',
                    });
                }
            }
            continue;
        }

        const importPath = extractImportPath(child, language, config);
        if (importPath) {
            edges.push({
                sourceId: `file:${filePath}`,
                targetId: `file:${resolveImportPath(filePath, importPath, config)}`,
                type: 'imports',
            });
        }
    }
}

function extractImportPath(
    node: SyntaxNode,
    language: string,
    config: LanguageConfig,
): string | null {
    if (language === 'python') {
        if (node.type === 'import_from_statement') {
            const moduleName = node.childForFieldName('module_name');
            return moduleName?.text ?? null;
        }
        if (node.type === 'import_statement') {
            const name = node.childForFieldName('name');
            return name?.text ?? null;
        }
        return null;
    }

    if (language === 'c' || language === 'cpp') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) return pathNode.text.replace(/[<>"]/g, '');
        return null;
    }

    if (language === 'java') {
        for (const child of node.children) {
            if (child.type === 'scoped_identifier') return child.text;
        }
        return null;
    }

    if (language === 'go') {
        for (const child of node.children) {
            if (child.type === 'import_spec_list') {
                for (const spec of child.children) {
                    if (spec.type === 'import_spec') {
                        const pathNode = spec.childForFieldName('path');
                        if (pathNode) return pathNode.text.replace(/"/g, '');
                    }
                }
            }
            if (child.type === 'import_spec') {
                const pathNode = child.childForFieldName('path');
                if (pathNode) return pathNode.text.replace(/"/g, '');
            }
        }
        return null;
    }

    if (language === 'rust') {
        const arg = node.childForFieldName('argument');
        if (arg) return arg.text.replace(/::\{.*\}$/, '');
        return null;
    }

    if (config.importSourceField) {
        const source = node.childForFieldName(config.importSourceField);
        if (source) return source.text.replace(/['"]/g, '');
    }

    return null;
}

function getFunctionName(node: SyntaxNode, language: string): string | null {
    const nameNode = node.childForFieldName('name');
    if (nameNode && nameNode.type !== 'ERROR') return nameNode.text;

    if (language === 'c' || language === 'cpp') {
        const declarator = node.childForFieldName('declarator');
        if (declarator) {
            const inner = declarator.childForFieldName('declarator');
            if (inner) {
                if (inner.type === 'identifier') return inner.text;
                const deepest = inner.childForFieldName('declarator');
                if (deepest?.type === 'identifier') return deepest.text;
            }
            if (declarator.type === 'identifier') return declarator.text;
        }
    }

    const parent = node.parent;
    if (parent?.type === 'variable_declarator') {
        const name = parent.childForFieldName('name');
        if (name) return name.text;
    }

    return null;
}

function getClassName(node: SyntaxNode, _language: string): string | null {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return nameNode.text;

    for (const child of node.children) {
        if (child.type === 'type_identifier' || child.type === 'identifier') {
            return child.text;
        }
    }

    return null;
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
    config: LanguageConfig,
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
        if (config.callTypes.has(node.type)) {
            if (node.type === 'new_expression' || node.type === 'object_creation_expression') {
                const nameNode =
                    node.childForFieldName('constructor') ?? node.childForFieldName('type');
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
            } else {
                const info = resolveCallExpression(node, filePath, fnScopes);
                if (info) {
                    const targetId = resolveCallTarget(info, filePath, symbolTable);
                    if (targetId) {
                        edges.push({ sourceId: info.callerNodeId, targetId, type: 'calls' });
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
    const fnField =
        node.childForFieldName('function') ??
        node.childForFieldName('name') ??
        node.childForFieldName('method');
    if (!fnField) return null;
    const callerNodeId = findEnclosingFunction(node, filePath, fnScopes);
    if (!callerNodeId) return null;

    if (
        fnField.type === 'member_expression' ||
        fnField.type === 'attribute' ||
        fnField.type === 'selector_expression' ||
        fnField.type === 'field_expression'
    ) {
        const property =
            fnField.childForFieldName('property') ??
            fnField.childForFieldName('attribute') ??
            fnField.childForFieldName('field');
        if (!property) return null;
        return {
            callerNodeId,
            calledName: property.text,
            isMethodCall: true,
            objectName: fnField.childForFieldName('object')?.text,
        };
    }
    if (fnField.type === 'identifier' || fnField.type === 'scoped_identifier') {
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

function buildSymbolTable(
    root: SyntaxNode,
    filePath: string,
    language: string,
    config: LanguageConfig,
): Map<string, SymbolEntry> {
    const table = new Map<string, SymbolEntry>();

    for (const child of root.children) {
        if (!config.importTypes.has(child.type)) continue;

        const importPath = extractImportPath(child, language, config);
        if (!importPath) continue;

        const resolvedPath = resolveImportPath(filePath, importPath, config);

        if (language === 'javascript' || language === 'typescript' || language === 'tsx') {
            buildJsSymbolTable(child, importPath, resolvedPath, table);
        } else if (language === 'python') {
            buildPythonSymbolTable(child, importPath, resolvedPath, table);
        }
    }
    return table;
}

function buildJsSymbolTable(
    importNode: SyntaxNode,
    importPath: string,
    resolvedPath: string,
    table: Map<string, SymbolEntry>,
): void {
    const importClause = importNode.children.find((c) => c.type === 'import_clause');
    if (!importClause) return;

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

function buildPythonSymbolTable(
    importNode: SyntaxNode,
    importPath: string,
    resolvedPath: string,
    table: Map<string, SymbolEntry>,
): void {
    if (importNode.type !== 'import_from_statement') return;

    for (const child of importNode.children) {
        if (child.type === 'dotted_name' && child !== importNode.childForFieldName('module_name')) {
            const aliasNode = child.parent?.children.find((c) => c.type === 'aliased_import');
            const localName = aliasNode?.childForFieldName('alias')?.text ?? child.text;
            table.set(localName, {
                localName,
                originalName: child.text,
                sourcePath: importPath,
                resolvedSourcePath: resolvedPath,
            });
        }
        if (child.type === 'aliased_import') {
            const nameNode = child.childForFieldName('name');
            const aliasNode = child.childForFieldName('alias');
            if (nameNode) {
                const localName = aliasNode?.text ?? nameNode.text;
                table.set(localName, {
                    localName,
                    originalName: nameNode.text,
                    sourcePath: importPath,
                    resolvedSourcePath: resolvedPath,
                });
            }
        }
    }
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
    if (!name || name === 'default') return 'fn';
    if (name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) return 'class';
    return 'fn';
}

function resolveImportPath(fromFile: string, importPath: string, config: LanguageConfig): string {
    if (!importPath.startsWith('.')) return importPath;

    const cacheKey = `${fromFile}:${importPath}`;
    const cached = resolveCache.get(cacheKey);
    if (cached) return cached;

    if (resolveCache.size >= 10000) resolveCache.clear();

    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, importPath);

    if (fs.existsSync(resolved)) {
        resolveCache.set(cacheKey, resolved);
        return resolved;
    }

    for (const ext of config.extensions) {
        const withExt = resolved + ext;
        if (fs.existsSync(withExt)) {
            resolveCache.set(cacheKey, withExt);
            return withExt;
        }
    }

    const stripped = resolved.replace(/\.js$/, '.ts');
    if (stripped !== resolved && fs.existsSync(stripped)) {
        resolveCache.set(cacheKey, stripped);
        return stripped;
    }

    resolveCache.set(cacheKey, resolved);
    return resolved;
}
