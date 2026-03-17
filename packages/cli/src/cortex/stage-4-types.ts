import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { getGrammar } from '#core/languages.js';
import { CortexRepository } from './repository.js';
import type {
    StageResult,
    StageError,
    TypeConstraint,
    GenericInstantiation,
    VariableNode,
    ContainsEdge,
    ImplementsEdge,
    FileNode,
    FunctionNode,
    MethodNode,
    ConstraintSource,
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

interface SeedResult {
    constraints: TypeConstraint[];
    generics: GenericInstantiation[];
    newVariables: VariableNode[];
    newContainsEdges: ContainsEdge[];
    implementsEdges: ImplementsEdge[];
}

interface PropagationItem {
    symbolId: string;
    typeName: string;
    confidence: number;
    source: ConstraintSource;
    filePath: string;
    line: number;
}

export async function runStage4(
    repo: CortexRepository,
    rootDir: string,
    options?: { force?: boolean; targetFiles?: string[] },
): Promise<StageResult> {
    const start = Date.now();
    const errors: StageError[] = [];
    let filesProcessed = 0;
    let nodesCreated = 0;
    let edgesCreated = 0;

    const allFiles = options?.force
        ? await repo.getAllFileNodes()
        : await repo.getFilesByMaxDepth(4);
    const files = options?.force ? allFiles : allFiles.filter((f) => f.depthLevel >= 3);

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
                stage: 4,
                message: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        const grammar = getGrammar(file.language);
        if (!grammar) continue;

        try {
            const functions = await repo.getFunctionsByFile(file.path);
            const methods = await repo.getMethodsByFile(file.path);
            const existingVars = await repo.getVariablesByFile(file.path);
            const existingVarIds = new Set(existingVars.map((v) => v.id));

            const fileId = `file:${file.path}`;
            const symbolTable = await repo.getSymbolTable(fileId);

            const seed = extractTypeInfo(
                content,
                grammar,
                file,
                functions,
                methods,
                existingVarIds,
                symbolTable,
            );

            await repo.deleteTypeConstraintsForFile(file.path);
            await repo.deleteGenericInstantiationsForFile(file.path);

            if (seed.newVariables.length > 0) {
                await repo.insertVariableNodes(seed.newVariables);
                nodesCreated += seed.newVariables.length;
            }
            if (seed.newContainsEdges.length > 0) {
                await repo.insertContainsEdges(seed.newContainsEdges);
                edgesCreated += seed.newContainsEdges.length;
            }
            if (seed.constraints.length > 0) {
                await repo.insertTypeConstraints(seed.constraints);
            }
            if (seed.generics.length > 0) {
                await repo.insertGenericInstantiations(seed.generics);
            }
            if (seed.implementsEdges.length > 0) {
                await repo.insertImplementsEdges(seed.implementsEdges);
                edgesCreated += seed.implementsEdges.length;
            }

            const propagated = await propagateTypes(repo, file.path, seed.constraints);
            if (propagated.length > 0) {
                await repo.insertTypeConstraints(propagated);
            }

            const allConstraints = [...seed.constraints, ...propagated];
            await updateVariableTypes(repo, file.path, allConstraints);

            await refineCallEdges(repo, file.path, allConstraints);

            await repo.upsertFileNode({ ...file, depthLevel: 4 });
            filesProcessed++;
        } catch (err) {
            errors.push({
                filePath: file.path,
                stage: 4,
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return {
        stage: 4,
        filesProcessed,
        nodesCreated,
        edgesCreated,
        durationMs: Date.now() - start,
        errors,
    };
}

function isJsTs(language: string): boolean {
    return language === 'javascript' || language === 'typescript' || language === 'tsx';
}

function extractTypeInfo(
    content: string,
    grammar: unknown,
    file: FileNode,
    functions: FunctionNode[],
    methods: MethodNode[],
    existingVarIds: Set<string>,
    symbolTable: Map<string, import('./types.js').SymbolTableEntry> | null,
): SeedResult {
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(content);
    const root: SyntaxNode = tree.rootNode;

    const constraints: TypeConstraint[] = [];
    const generics: GenericInstantiation[] = [];
    const newVariables: VariableNode[] = [];
    const newContainsEdges: ContainsEdge[] = [];
    const implementsEdges: ImplementsEdge[] = [];
    const relPath = file.path;
    const fileId = `file:${relPath}`;

    const fnMap = new Map(functions.map((f) => [f.name, f]));
    const methodMap = new Map(methods.map((m) => [m.qualifiedName, m]));

    const cursor: TreeCursor = root.walk();
    let done = false;

    while (!done) {
        const node: SyntaxNode = cursor.currentNode;

        if (node.type === 'function_declaration' || node.type === 'method_definition') {
            extractFunctionAnnotations(node, relPath, fnMap, methodMap, constraints);
        }

        if (node.type === 'class_declaration' || node.type === 'class') {
            extractGenericImplements(node, relPath, implementsEdges);
        }

        if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
            extractVariableTypeInfo(
                node,
                relPath,
                fileId,
                existingVarIds,
                symbolTable,
                constraints,
                generics,
                newVariables,
                newContainsEdges,
            );
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

    return { constraints, generics, newVariables, newContainsEdges, implementsEdges };
}

function extractFunctionAnnotations(
    node: SyntaxNode,
    relPath: string,
    fnMap: Map<string, FunctionNode>,
    methodMap: Map<string, MethodNode>,
    constraints: TypeConstraint[],
): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;
    const name = nameNode.text;

    const isMethod = node.type === 'method_definition';
    let symbolId: string;

    if (isMethod) {
        const classNode = findParentClass(node);
        if (!classNode) return;
        const className = classNode.childForFieldName('name')?.text;
        if (!className) return;
        const qualifiedName = `${className}.${name}`;
        const method = methodMap.get(qualifiedName);
        if (!method) return;
        symbolId = method.id;
    } else {
        const fn = fnMap.get(name);
        if (!fn) return;
        symbolId = fn.id;
    }

    const params = node.childForFieldName('parameters');
    if (params) {
        extractParameterAnnotations(params, symbolId, relPath, constraints);
    }

    const returnType = node.childForFieldName('return_type');
    if (returnType) {
        const typeName = returnType.text.replace(/^:\s*/, '');
        constraints.push({
            symbolId,
            typeName,
            source: 'return_type',
            confidence: 0.95,
            filePath: relPath,
            line: returnType.startPosition.row + 1,
        });
    }
}

function extractParameterAnnotations(
    params: SyntaxNode,
    symbolId: string,
    relPath: string,
    constraints: TypeConstraint[],
): void {
    for (const param of params.children) {
        if (param.type === 'required_parameter' || param.type === 'optional_parameter') {
            const typeAnnotation =
                param.childForFieldName('type') ??
                param.children.find((c) => c.type === 'type_annotation');
            if (typeAnnotation) {
                const typeName = typeAnnotation.text.replace(/^:\s*/, '');
                constraints.push({
                    symbolId,
                    typeName,
                    source: 'annotation',
                    confidence: 0.95,
                    filePath: relPath,
                    line: param.startPosition.row + 1,
                });
            }
        }
    }
}

function extractVariableTypeInfo(
    node: SyntaxNode,
    relPath: string,
    fileId: string,
    existingVarIds: Set<string>,
    symbolTable: Map<string, import('./types.js').SymbolTableEntry> | null,
    constraints: TypeConstraint[],
    generics: GenericInstantiation[],
    newVariables: VariableNode[],
    newContainsEdges: ContainsEdge[],
): void {
    for (const child of node.children) {
        if (child.type !== 'variable_declarator') continue;

        const nameNode = child.childForFieldName('name');
        if (!nameNode) continue;
        const name = nameNode.text;
        const varId = `var:${relPath}:${name}`;
        const line = child.startPosition.row + 1;

        if (!existingVarIds.has(varId)) {
            const isExported = isNodeExported(node);
            const typeAnnotation = child.childForFieldName('type');
            const inferredType = typeAnnotation ? typeAnnotation.text.replace(/^:\s*/, '') : null;

            newVariables.push({
                id: varId,
                name,
                scope: 'module',
                filePath: relPath,
                lineStart: line,
                lineEnd: child.endPosition.row + 1,
                isExported,
                inferredType,
            });
            newContainsEdges.push({
                sourceId: fileId,
                targetId: varId,
                confidence: 1.0,
                stage: 4,
                reason: null,
            });
            existingVarIds.add(varId);
        }

        const typeAnnotation = child.childForFieldName('type');
        if (typeAnnotation) {
            const typeName = typeAnnotation.text.replace(/^:\s*/, '');
            constraints.push({
                symbolId: varId,
                typeName,
                source: 'annotation',
                confidence: 0.95,
                filePath: relPath,
                line,
            });
        }

        const valueNode = child.childForFieldName('value');
        if (!valueNode) continue;

        if (valueNode.type === 'new_expression') {
            extractNewExpression(
                valueNode,
                varId,
                relPath,
                line,
                symbolTable,
                constraints,
                generics,
            );
        }
    }
}

function extractNewExpression(
    node: SyntaxNode,
    varId: string,
    relPath: string,
    line: number,
    _symbolTable: Map<string, import('./types.js').SymbolTableEntry> | null,
    constraints: TypeConstraint[],
    generics: GenericInstantiation[],
): void {
    const ctorNode =
        node.childForFieldName('constructor') ??
        node.children.find((c) => c.type === 'identifier' || c.type === 'type_identifier');
    if (!ctorNode) return;

    const className = ctorNode.text;
    constraints.push({
        symbolId: varId,
        typeName: className,
        source: 'constructor',
        confidence: 0.9,
        filePath: relPath,
        line,
    });

    const typeArgs = node.children.find((c) => c.type === 'type_arguments');
    if (typeArgs) {
        const args: string[] = [];
        for (const typeArg of typeArgs.children) {
            if (
                typeArg.type === 'type_identifier' ||
                typeArg.type === 'predefined_type' ||
                typeArg.type === 'generic_type'
            ) {
                args.push(typeArg.text);
            }
        }
        if (args.length > 0) {
            generics.push({
                symbolId: varId,
                genericName: className,
                typeArguments: args,
                filePath: relPath,
                line,
            });
        }
    }
}

function extractGenericImplements(
    classNode: SyntaxNode,
    relPath: string,
    implementsEdges: ImplementsEdge[],
): void {
    const className = classNode.childForFieldName('name')?.text;
    if (!className) return;
    const classId = `class:${relPath}:${className}`;

    for (const child of classNode.children) {
        if (child.type !== 'class_heritage') continue;
        for (const clause of child.children) {
            if (clause.type !== 'implements_clause') continue;
            for (const typeRef of clause.children) {
                if (typeRef.type === 'generic_type') {
                    const nameNode = typeRef.children.find(
                        (c) => c.type === 'identifier' || c.type === 'type_identifier',
                    );
                    if (nameNode) {
                        implementsEdges.push({
                            sourceId: classId,
                            targetId: `interface:${relPath}:${nameNode.text}`,
                            line: clause.startPosition.row + 1,
                            confidence: 1.0,
                            stage: 4,
                            reason: 'generic_implements',
                        });
                    }
                }
            }
        }
    }
}

function findParentClass(node: SyntaxNode): SyntaxNode | null {
    let parent = node.parent;
    while (parent) {
        if (parent.type === 'class_declaration' || parent.type === 'class') {
            return parent;
        }
        parent = parent.parent;
    }
    return null;
}

function isNodeExported(node: SyntaxNode): boolean {
    const parent = node.parent;
    if (parent?.type === 'export_statement') return true;
    const grandparent = parent?.parent;
    if (grandparent?.type === 'export_statement') return true;
    return false;
}

async function propagateTypes(
    repo: CortexRepository,
    filePath: string,
    seedConstraints: TypeConstraint[],
): Promise<TypeConstraint[]> {
    const propagated: TypeConstraint[] = [];
    const seen = new Set<string>();

    for (const c of seedConstraints) {
        seen.add(`${c.symbolId}:${c.typeName}`);
    }

    const worklist: PropagationItem[] = [];

    const functions = await repo.getFunctionsByFile(filePath);
    const methods = await repo.getMethodsByFile(filePath);
    const variables = await repo.getVariablesByFile(filePath);

    const returnTypeByFn = new Map<string, string>();
    for (const c of seedConstraints) {
        if (c.source === 'return_type') {
            returnTypeByFn.set(c.symbolId, c.typeName);
        }
    }

    const ctorTypeByVar = new Map<string, string>();
    for (const c of seedConstraints) {
        if (c.source === 'constructor') {
            ctorTypeByVar.set(c.symbolId, c.typeName);
        }
    }

    for (const v of variables) {
        const calls = await repo.getCallsFrom(v.id);
        if (calls.length > 0) continue;
    }

    for (const fn of [...functions, ...methods]) {
        const calls = await repo.getCallsFrom(fn.id);
        for (const call of calls) {
            const returnType = returnTypeByFn.get(call.targetId);
            if (!returnType) continue;

            const assignedVars = variables.filter((v) => {
                const varLine = v.lineStart;
                return varLine >= fn.lineStart && varLine <= fn.lineEnd;
            });

            for (const v of assignedVars) {
                const key = `${v.id}:${returnType}`;
                if (seen.has(key)) continue;
                seen.add(key);

                const item: PropagationItem = {
                    symbolId: v.id,
                    typeName: returnType,
                    confidence: 0.8,
                    source: 'assignment',
                    filePath,
                    line: v.lineStart,
                };
                worklist.push(item);
            }
        }
    }

    for (const fn of functions) {
        const returnType = returnTypeByFn.get(fn.id);
        if (!returnType) continue;

        const callsTo = await repo.getCallsTo(fn.id);
        for (const call of callsTo) {
            const callerFn = functions.find((f) => f.id === call.sourceId);
            if (!callerFn) continue;

            const innerVars = variables.filter(
                (v) => v.lineStart >= callerFn.lineStart && v.lineStart <= callerFn.lineEnd,
            );
            for (const v of innerVars) {
                const key = `${v.id}:${returnType}`;
                if (seen.has(key)) continue;
                seen.add(key);
                worklist.push({
                    symbolId: v.id,
                    typeName: returnType,
                    confidence: 0.75,
                    source: 'assignment',
                    filePath,
                    line: v.lineStart,
                });
            }
        }
    }

    while (worklist.length > 0) {
        const item = worklist.pop()!;
        propagated.push({
            symbolId: item.symbolId,
            typeName: item.typeName,
            source: item.source,
            confidence: item.confidence,
            filePath: item.filePath,
            line: item.line,
        });
    }

    return propagated;
}

async function updateVariableTypes(
    repo: CortexRepository,
    _filePath: string,
    allConstraints: TypeConstraint[],
): Promise<void> {
    const bySymbol = new Map<string, TypeConstraint[]>();
    for (const c of allConstraints) {
        if (!c.symbolId.startsWith('var:')) continue;
        const list = bySymbol.get(c.symbolId) ?? [];
        list.push(c);
        bySymbol.set(c.symbolId, list);
    }

    for (const [symbolId, constraints] of bySymbol) {
        constraints.sort((a, b) => b.confidence - a.confidence);
        const best = constraints[0];
        await repo.updateVariableType(symbolId, best.typeName);
    }
}

async function refineCallEdges(
    repo: CortexRepository,
    filePath: string,
    allConstraints: TypeConstraint[],
): Promise<void> {
    const functions = await repo.getFunctionsByFile(filePath);
    const methods = await repo.getMethodsByFile(filePath);

    for (const fn of [...functions, ...methods]) {
        const calls = await repo.getCallsFrom(fn.id);
        for (const call of calls) {
            if (call.confidence >= 0.9) continue;

            const hasTypeInfo = allConstraints.some(
                (c) => c.symbolId === call.sourceId || c.symbolId === call.targetId,
            );
            if (hasTypeInfo && call.confidence < 0.7) {
                await repo.updateCallEdgeConfidence(
                    call.sourceId,
                    call.targetId,
                    0.7,
                    'type-refined',
                );
            }
        }
    }
}
