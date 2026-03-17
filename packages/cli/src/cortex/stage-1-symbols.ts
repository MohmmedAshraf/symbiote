import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { getGrammar } from '#core/languages.js';
import { CortexRepository } from './repository.js';
import type {
    StageResult,
    StageError,
    FileNode,
    FunctionNode,
    ClassNode,
    MethodNode,
    InterfaceNode,
    TypeNode,
    VariableNode,
    ContainsEdge,
    ExtendsEdge,
    ImplementsEdge,
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

interface LanguageConfig {
    functionTypes: Set<string>;
    classTypes: Set<string>;
    methodTypes: Set<string>;
    interfaceTypes: Set<string>;
    typeAliasTypes: Set<string>;
    enumTypes: Set<string>;
    variableTypes: Set<string>;
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
    variableTypes: new Set(['lexical_declaration']),
};

const PYTHON_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_definition']),
    classTypes: new Set(['class_definition']),
    methodTypes: new Set(['function_definition']),
    interfaceTypes: new Set(),
    typeAliasTypes: new Set(),
    enumTypes: new Set(),
    variableTypes: new Set(),
};

const GO_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_declaration', 'method_declaration']),
    classTypes: new Set(),
    methodTypes: new Set(),
    interfaceTypes: new Set(),
    typeAliasTypes: new Set(),
    enumTypes: new Set(),
    variableTypes: new Set(),
};

const RUST_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_item']),
    classTypes: new Set(['struct_item']),
    methodTypes: new Set(['function_item']),
    interfaceTypes: new Set(['trait_item']),
    typeAliasTypes: new Set(['type_item']),
    enumTypes: new Set(['enum_item']),
    variableTypes: new Set(),
};

const JAVA_CONFIG: LanguageConfig = {
    functionTypes: new Set(),
    classTypes: new Set(['class_declaration']),
    methodTypes: new Set(['method_declaration', 'constructor_declaration']),
    interfaceTypes: new Set(['interface_declaration']),
    typeAliasTypes: new Set(),
    enumTypes: new Set(['enum_declaration']),
    variableTypes: new Set(),
};

const RUBY_CONFIG: LanguageConfig = {
    functionTypes: new Set(['method']),
    classTypes: new Set(['class', 'module']),
    methodTypes: new Set(['method', 'singleton_method']),
    interfaceTypes: new Set(),
    typeAliasTypes: new Set(),
    enumTypes: new Set(),
    variableTypes: new Set(),
};

const PHP_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_definition']),
    classTypes: new Set(['class_declaration']),
    methodTypes: new Set(['method_declaration']),
    interfaceTypes: new Set(['interface_declaration']),
    typeAliasTypes: new Set(),
    enumTypes: new Set(['enum_declaration']),
    variableTypes: new Set(),
};

const C_CPP_CONFIG: LanguageConfig = {
    functionTypes: new Set(['function_definition']),
    classTypes: new Set(['class_specifier']),
    methodTypes: new Set(['function_definition']),
    interfaceTypes: new Set(),
    typeAliasTypes: new Set(),
    enumTypes: new Set(),
    variableTypes: new Set(),
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

interface ExtractedSymbols {
    functions: FunctionNode[];
    classes: ClassNode[];
    methods: MethodNode[];
    interfaces: InterfaceNode[];
    types: TypeNode[];
    variables: VariableNode[];
    containsEdges: ContainsEdge[];
    extendsEdges: ExtendsEdge[];
    implementsEdges: ImplementsEdge[];
}

export async function runStage1(
    repo: CortexRepository,
    rootDir: string,
    options?: { force?: boolean; targetFiles?: string[] },
): Promise<StageResult> {
    const start = Date.now();
    const errors: StageError[] = [];
    let filesProcessed = 0;
    let nodesCreated = 0;
    let edgesCreated = 0;

    const files = options?.force ? await repo.getAllFileNodes() : await repo.getFilesByMaxDepth(1);

    const targetSet = options?.targetFiles ? new Set(options.targetFiles) : null;

    for (const file of files) {
        if (targetSet && !targetSet.has(file.path)) continue;
        if (!file.language) continue;

        const absPath = resolve(rootDir, file.path);
        let content: string;
        try {
            content = readFileSync(absPath, 'utf-8');
        } catch (err) {
            errors.push({
                filePath: file.path,
                stage: 1,
                message: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        const grammar = getGrammar(file.language);
        if (!grammar) continue;

        const config = LANGUAGE_CONFIGS[file.language] ?? JS_TS_CONFIG;

        let extracted: ExtractedSymbols;
        try {
            extracted = extractSymbols(content, grammar, config, file);
        } catch (err) {
            errors.push({
                filePath: file.path,
                stage: 1,
                message: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        await repo.deleteFileData(file.path);
        await repo.upsertFileNode({ ...file, depthLevel: 0 });

        filesProcessed++;

        if (extracted.functions.length > 0) {
            await repo.insertFunctionNodes(extracted.functions);
            nodesCreated += extracted.functions.length;
        }
        if (extracted.classes.length > 0) {
            await repo.insertClassNodes(extracted.classes);
            nodesCreated += extracted.classes.length;
        }
        if (extracted.methods.length > 0) {
            await repo.insertMethodNodes(extracted.methods);
            nodesCreated += extracted.methods.length;
        }
        if (extracted.interfaces.length > 0) {
            await repo.insertInterfaceNodes(extracted.interfaces);
            nodesCreated += extracted.interfaces.length;
        }
        if (extracted.types.length > 0) {
            await repo.insertTypeNodes(extracted.types);
            nodesCreated += extracted.types.length;
        }
        if (extracted.variables.length > 0) {
            await repo.insertVariableNodes(extracted.variables);
            nodesCreated += extracted.variables.length;
        }
        if (extracted.containsEdges.length > 0) {
            await repo.insertContainsEdges(extracted.containsEdges);
            edgesCreated += extracted.containsEdges.length;
        }
        if (extracted.extendsEdges.length > 0) {
            await repo.insertExtendsEdges(extracted.extendsEdges);
            edgesCreated += extracted.extendsEdges.length;
        }
        if (extracted.implementsEdges.length > 0) {
            await repo.insertImplementsEdges(extracted.implementsEdges);
            edgesCreated += extracted.implementsEdges.length;
        }

        await repo.upsertFileNode({ ...file, depthLevel: 1 });
    }

    return {
        stage: 1,
        filesProcessed,
        nodesCreated,
        edgesCreated,
        durationMs: Date.now() - start,
        errors,
    };
}

function extractSymbols(
    content: string,
    grammar: unknown,
    config: LanguageConfig,
    file: FileNode,
): ExtractedSymbols {
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(content);

    const result: ExtractedSymbols = {
        functions: [],
        classes: [],
        methods: [],
        interfaces: [],
        types: [],
        variables: [],
        containsEdges: [],
        extendsEdges: [],
        implementsEdges: [],
    };

    const relPath = file.path;
    const fileId = `file:${relPath}`;

    const cursor: TreeCursor = tree.rootNode.walk();
    let reachedRoot = false;

    while (!reachedRoot) {
        const node: SyntaxNode = cursor.currentNode;

        if (config.functionTypes.has(node.type) && !isInsideClass(node, config)) {
            const name = getFunctionName(node);
            if (name) {
                const isAsync = hasAsyncKeyword(node);
                const isExported = isNodeExported(node);
                const signature = extractSignature(node);
                const fnNode: FunctionNode = {
                    id: `fn:${relPath}:${name}`,
                    name,
                    qualifiedName: name,
                    filePath: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    isAsync,
                    isExported,
                    isEntryPoint: false,
                    entryPointScore: 0,
                    signature,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                };
                result.functions.push(fnNode);
                result.containsEdges.push({
                    sourceId: fileId,
                    targetId: fnNode.id,
                    confidence: 1.0,
                    stage: 1,
                    reason: null,
                });
            }
        }

        if (config.classTypes.has(node.type)) {
            const name = getClassName(node);
            if (name) {
                const isAbstract = hasAbstractKeyword(node);
                const isExported = isNodeExported(node);
                const classNode: ClassNode = {
                    id: `class:${relPath}:${name}`,
                    name,
                    filePath: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    isAbstract,
                    isExported,
                    community: null,
                    pageRank: null,
                    betweenness: null,
                };
                result.classes.push(classNode);
                result.containsEdges.push({
                    sourceId: fileId,
                    targetId: classNode.id,
                    confidence: 1.0,
                    stage: 1,
                    reason: null,
                });

                extractClassHeritage(node, relPath, name, result);
                extractMethods(node, relPath, name, config, result, fileId);
            }
        }

        if (config.interfaceTypes.has(node.type)) {
            const name = node.childForFieldName('name')?.text;
            if (name) {
                const isExported = isNodeExported(node);
                const ifaceNode: InterfaceNode = {
                    id: `interface:${relPath}:${name}`,
                    name,
                    filePath: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    isExported,
                };
                result.interfaces.push(ifaceNode);
                result.containsEdges.push({
                    sourceId: fileId,
                    targetId: ifaceNode.id,
                    confidence: 1.0,
                    stage: 1,
                    reason: null,
                });
            }
        }

        if (config.typeAliasTypes.has(node.type)) {
            const name = node.childForFieldName('name')?.text;
            if (name) {
                const isExported = isNodeExported(node);
                const typeNode: TypeNode = {
                    id: `type:${relPath}:${name}`,
                    name,
                    kind: 'type_alias',
                    filePath: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    isExported,
                };
                result.types.push(typeNode);
                result.containsEdges.push({
                    sourceId: fileId,
                    targetId: typeNode.id,
                    confidence: 1.0,
                    stage: 1,
                    reason: null,
                });
            }
        }

        if (config.enumTypes.has(node.type)) {
            const name = node.childForFieldName('name')?.text;
            if (name) {
                const isExported = isNodeExported(node);
                const typeNode: TypeNode = {
                    id: `type:${relPath}:${name}`,
                    name,
                    kind: 'enum',
                    filePath: relPath,
                    lineStart: node.startPosition.row + 1,
                    lineEnd: node.endPosition.row + 1,
                    isExported,
                };
                result.types.push(typeNode);
                result.containsEdges.push({
                    sourceId: fileId,
                    targetId: typeNode.id,
                    confidence: 1.0,
                    stage: 1,
                    reason: null,
                });
            }
        }

        if (config.variableTypes.has(node.type) && isAtModuleLevel(node)) {
            extractVariables(node, relPath, fileId, result);
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

    return result;
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

function getFunctionName(node: SyntaxNode): string | null {
    const nameNode = node.childForFieldName('name');
    if (nameNode && nameNode.type !== 'ERROR') return nameNode.text;

    const declarator = node.childForFieldName('declarator');
    if (declarator) {
        if (declarator.type === 'function_declarator') {
            const innerName = declarator.childForFieldName('declarator');
            if (innerName) return innerName.text;
        }
        if (declarator.type === 'identifier') return declarator.text;
    }

    const parent = node.parent;
    if (parent?.type === 'variable_declarator') {
        const name = parent.childForFieldName('name');
        if (name) return name.text;
    }

    return null;
}

function getClassName(node: SyntaxNode): string | null {
    const nameNode = node.childForFieldName('name');
    if (nameNode) return nameNode.text;

    for (const child of node.children) {
        if (child.type === 'type_identifier' || child.type === 'identifier') {
            return child.text;
        }
    }

    return null;
}

function hasAsyncKeyword(node: SyntaxNode): boolean {
    for (const child of node.children) {
        if (child.type === 'async') return true;
    }
    const parent = node.parent;
    if (parent) {
        for (const child of parent.children) {
            if (child.type === 'async' && child === parent.children[0]) return true;
        }
    }
    return false;
}

function hasAbstractKeyword(node: SyntaxNode): boolean {
    const parent = node.parent;
    if (parent?.type === 'abstract_class_declaration') return true;
    for (const child of node.children) {
        if (child.text === 'abstract') return true;
    }
    return false;
}

function isNodeExported(node: SyntaxNode): boolean {
    const parent = node.parent;
    if (parent?.type === 'export_statement') return true;

    const grandparent = parent?.parent;
    if (grandparent?.type === 'export_statement') return true;

    if (parent?.type === 'lexical_declaration' && grandparent?.type === 'export_statement') {
        return true;
    }

    return false;
}

function isAtModuleLevel(node: SyntaxNode): boolean {
    const parent = node.parent;
    if (!parent) return true;
    if (parent.type === 'program') return true;
    if (parent.type === 'export_statement' && parent.parent?.type === 'program') return true;
    return false;
}

function extractSignature(node: SyntaxNode): string | null {
    const params = node.childForFieldName('parameters');
    if (!params) return null;

    const returnType = node.childForFieldName('return_type');
    if (returnType) {
        return `${params.text}: ${returnType.text.replace(/^:\s*/, '')}`;
    }

    return params.text;
}

function extractMethods(
    classNode: SyntaxNode,
    relPath: string,
    className: string,
    config: LanguageConfig,
    result: ExtractedSymbols,
    fileId: string,
): void {
    const body = classNode.childForFieldName('body') ?? findClassBody(classNode);
    if (!body) return;

    for (const child of body.children) {
        if (!config.methodTypes.has(child.type)) continue;

        const name = getFunctionName(child);
        if (!name) continue;

        const qualifiedName = `${className}.${name}`;
        const visibility = getVisibility(child);
        const isStatic = hasStaticKeyword(child);
        const isAsync = hasAsyncKeyword(child);
        const methodNode: MethodNode = {
            id: `method:${relPath}:${qualifiedName}`,
            name,
            className,
            qualifiedName,
            filePath: relPath,
            lineStart: child.startPosition.row + 1,
            lineEnd: child.endPosition.row + 1,
            visibility,
            isStatic,
            isAsync,
            community: null,
            pageRank: null,
            betweenness: null,
        };
        result.methods.push(methodNode);
        result.containsEdges.push({
            sourceId: fileId,
            targetId: methodNode.id,
            confidence: 1.0,
            stage: 1,
            reason: null,
        });
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

function getVisibility(node: SyntaxNode): string {
    for (const child of node.children) {
        if (child.type === 'accessibility_modifier') {
            return child.text;
        }
    }
    return 'public';
}

function hasStaticKeyword(node: SyntaxNode): boolean {
    for (const child of node.children) {
        if (child.text === 'static') return true;
    }
    return false;
}

function extractClassHeritage(
    classNode: SyntaxNode,
    relPath: string,
    className: string,
    result: ExtractedSymbols,
): void {
    const classId = `class:${relPath}:${className}`;

    for (const child of classNode.children) {
        if (child.type === 'class_heritage') {
            for (const clause of child.children) {
                if (clause.type === 'extends_clause') {
                    const typeNode = clause.children.find(
                        (c) => c.type === 'identifier' || c.type === 'type_identifier',
                    );
                    if (typeNode) {
                        result.extendsEdges.push({
                            sourceId: classId,
                            targetId: `class:${relPath}:${typeNode.text}`,
                            line: clause.startPosition.row + 1,
                            confidence: 1.0,
                            stage: 1,
                            reason: null,
                        });
                    }
                }
                if (clause.type === 'implements_clause') {
                    for (const typeRef of clause.children) {
                        if (typeRef.type === 'identifier' || typeRef.type === 'type_identifier') {
                            result.implementsEdges.push({
                                sourceId: classId,
                                targetId: `interface:${relPath}:${typeRef.text}`,
                                line: clause.startPosition.row + 1,
                                confidence: 1.0,
                                stage: 1,
                                reason: null,
                            });
                        }
                    }
                }
            }
        }

        if (child.type === 'extends_type_clause') {
            const typeNode = child.children.find(
                (c) => c.type === 'identifier' || c.type === 'type_identifier',
            );
            if (typeNode) {
                result.extendsEdges.push({
                    sourceId: classId,
                    targetId: `class:${relPath}:${typeNode.text}`,
                    line: child.startPosition.row + 1,
                    confidence: 1.0,
                    stage: 1,
                    reason: null,
                });
            }
        }
    }
}

function extractVariables(
    node: SyntaxNode,
    relPath: string,
    fileId: string,
    result: ExtractedSymbols,
): void {
    const isExported = isNodeExported(node);
    if (!isExported) return;

    for (const child of node.children) {
        if (child.type === 'variable_declarator') {
            const nameNode = child.childForFieldName('name');
            if (!nameNode) continue;
            const name = nameNode.text;

            const typeAnnotation = child.childForFieldName('type');
            const inferredType = typeAnnotation ? typeAnnotation.text.replace(/^:\s*/, '') : null;

            const varNode: VariableNode = {
                id: `var:${relPath}:${name}`,
                name,
                scope: 'module',
                filePath: relPath,
                lineStart: child.startPosition.row + 1,
                lineEnd: child.endPosition.row + 1,
                isExported,
                inferredType,
            };
            result.variables.push(varNode);
            result.containsEdges.push({
                sourceId: fileId,
                targetId: varNode.id,
                confidence: 1.0,
                stage: 1,
                reason: null,
            });
        }
    }
}
