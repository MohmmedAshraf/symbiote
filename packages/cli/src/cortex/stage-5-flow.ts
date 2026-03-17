import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { getGrammar } from '../core/languages.js';
import { CortexRepository } from './repository.js';
import type {
    StageResult,
    StageError,
    FileNode,
    FunctionNode,
    MethodNode,
    CallsEdge,
    FlowsToEdge,
    ReadsEdge,
    WritesEdge,
    ReturnsEdge,
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

type CallableNode = FunctionNode | MethodNode;

interface FlowContext {
    flowsTo: FlowsToEdge[];
    reads: ReadsEdge[];
    writes: WritesEdge[];
    returns: ReturnsEdge[];
    asyncCalls: { sourceId: string; targetId: string }[];
}

const TAINT_SOURCE_PATTERNS = ['req.body', 'req.params', 'req.query'];
const ENTRY_POINT_PATTERNS = [/^handle/, /^on[A-Z]/, /Controller$/, /Handler$/];

export async function runStage5(
    repo: CortexRepository,
    rootDir: string,
    options?: { force?: boolean; targetFiles?: string[] },
): Promise<StageResult> {
    const start = Date.now();
    const errors: StageError[] = [];
    let filesProcessed = 0;
    let edgesCreated = 0;

    const allFiles = options?.force
        ? await repo.getAllFileNodes()
        : await repo.getFilesByMaxDepth(5);
    const files = options?.force ? allFiles : allFiles.filter((f) => f.depthLevel >= 4);

    const targetSet = options?.targetFiles ? new Set(options.targetFiles) : null;

    const eligibleFiles = files.filter((f) => {
        if (targetSet && !targetSet.has(f.path)) return false;
        if (!f.language) return false;
        return isJsTs(f.language);
    });

    const callGraph = await buildCallGraph(repo, eligibleFiles);
    const processingOrder = reverseTopologicalSort(callGraph);

    const processedFiles = new Set<string>();
    const ctx: FlowContext = {
        flowsTo: [],
        reads: [],
        writes: [],
        returns: [],
        asyncCalls: [],
    };

    for (const symbolId of processingOrder) {
        const filePath = extractFilePath(symbolId);
        if (!filePath) continue;

        const file = eligibleFiles.find((f) => f.path === filePath);
        if (!file) continue;

        if (!processedFiles.has(filePath)) {
            processedFiles.add(filePath);

            try {
                await processFile(repo, rootDir, file, callGraph, ctx);
            } catch (err) {
                errors.push({
                    filePath: file.path,
                    stage: 5,
                    message: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    for (const file of eligibleFiles) {
        if (processedFiles.has(file.path)) continue;

        try {
            await processFile(repo, rootDir, file, callGraph, ctx);
            processedFiles.add(file.path);
        } catch (err) {
            errors.push({
                filePath: file.path,
                stage: 5,
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    propagateTaintLabels(ctx.flowsTo);

    for (const file of eligibleFiles) {
        if (!processedFiles.has(file.path)) continue;

        try {
            await repo.deleteFlowEdgesForFile(file.path);
        } catch {
            // ignore cleanup errors
        }
    }

    if (ctx.flowsTo.length > 0) {
        await repo.insertFlowsToEdges(ctx.flowsTo);
        edgesCreated += ctx.flowsTo.length;
    }
    if (ctx.reads.length > 0) {
        await repo.insertReadsEdges(ctx.reads);
        edgesCreated += ctx.reads.length;
    }
    if (ctx.writes.length > 0) {
        await repo.insertWritesEdges(ctx.writes);
        edgesCreated += ctx.writes.length;
    }
    if (ctx.returns.length > 0) {
        await repo.insertReturnsEdges(ctx.returns);
        edgesCreated += ctx.returns.length;
    }

    for (const ac of ctx.asyncCalls) {
        await repo.updateCallEdgeAsync(ac.sourceId, ac.targetId, true);
    }

    for (const file of eligibleFiles) {
        if (!processedFiles.has(file.path)) continue;

        const functions = await repo.getFunctionsByFile(file.path);
        await scoreEntryPoints(repo, functions);
        await repo.upsertFileNode({ ...file, depthLevel: 5 });
        filesProcessed++;

        await repo.deleteFlowsForFile(file.path);
        const entryPoints = functions.filter((fn) => fn.isEntryPoint);
        if (entryPoints.length > 0) {
            const flows = await discoverFlows(repo, entryPoints, callGraph);
            if (flows.length > 0) {
                await repo.insertFlows(flows);
            }
        }
    }

    return {
        stage: 5,
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

function extractFilePath(symbolId: string): string | null {
    const parts = symbolId.split(':');
    if (parts.length < 3) return null;
    return parts[1];
}

interface CallGraphEntry {
    callsFrom: CallsEdge[];
    callsTo: CallsEdge[];
}

async function buildCallGraph(
    repo: CortexRepository,
    files: FileNode[],
): Promise<Map<string, CallGraphEntry>> {
    const graph = new Map<string, CallGraphEntry>();

    for (const file of files) {
        const functions = await repo.getFunctionsByFile(file.path);
        const methods = await repo.getMethodsByFile(file.path);
        const allCallables: CallableNode[] = [...functions, ...methods];

        for (const callable of allCallables) {
            const callsFrom = await repo.getCallsFrom(callable.id);
            const callsTo = await repo.getCallsTo(callable.id);
            graph.set(callable.id, { callsFrom, callsTo });
        }
    }

    return graph;
}

function reverseTopologicalSort(graph: Map<string, CallGraphEntry>): string[] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const [id] of graph) {
        if (!inDegree.has(id)) inDegree.set(id, 0);
        if (!adjacency.has(id)) adjacency.set(id, []);
    }

    for (const [id, entry] of graph) {
        for (const call of entry.callsFrom) {
            if (graph.has(call.targetId)) {
                adjacency.get(id)!.push(call.targetId);
                inDegree.set(call.targetId, (inDegree.get(call.targetId) ?? 0) + 1);
            }
        }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
        if (deg === 0) queue.push(id);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
        const node = queue.shift()!;
        sorted.push(node);
        for (const neighbor of adjacency.get(node) ?? []) {
            const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
            inDegree.set(neighbor, newDeg);
            if (newDeg === 0) queue.push(neighbor);
        }
    }

    for (const [id] of graph) {
        if (!sorted.includes(id)) sorted.push(id);
    }

    return sorted.reverse();
}

async function processFile(
    repo: CortexRepository,
    rootDir: string,
    file: FileNode,
    callGraph: Map<string, CallGraphEntry>,
    ctx: FlowContext,
): Promise<void> {
    const absPath = resolve(rootDir, file.path);
    const content = readFileSync(absPath, 'utf-8');
    const grammar = getGrammar(file.language!);
    if (!grammar) return;

    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(content);
    const root: SyntaxNode = tree.rootNode;

    const functions = await repo.getFunctionsByFile(file.path);
    const methods = await repo.getMethodsByFile(file.path);

    for (const fn of functions) {
        const fnNode = findFunctionNode(root, fn.name, fn.lineStart);
        if (!fnNode) continue;
        analyzeCallable(fn.id, fnNode, file.path, callGraph, ctx);
    }

    for (const method of methods) {
        const methodNode = findMethodNode(root, method.name, method.className, method.lineStart);
        if (!methodNode) continue;
        analyzeCallable(method.id, methodNode, file.path, callGraph, ctx);
    }

    connectCrossCallFlows(file.path, functions, methods, callGraph, ctx, root);
}

function findFunctionNode(root: SyntaxNode, name: string, lineStart: number): SyntaxNode | null {
    const cursor: TreeCursor = root.walk();
    let done = false;

    while (!done) {
        const node = cursor.currentNode;
        if (
            (node.type === 'function_declaration' || node.type === 'function') &&
            node.startPosition.row + 1 === lineStart
        ) {
            const nameNode = node.childForFieldName('name');
            if (nameNode?.text === name) return node;
        }

        if (node.type === 'lexical_declaration' && node.startPosition.row + 1 === lineStart) {
            for (const child of node.children) {
                if (child.type === 'variable_declarator') {
                    const nameNode = child.childForFieldName('name');
                    if (nameNode?.text === name) {
                        const value = child.childForFieldName('value');
                        if (value?.type === 'arrow_function' || value?.type === 'function') {
                            return value;
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

    return null;
}

function findMethodNode(
    root: SyntaxNode,
    name: string,
    className: string,
    lineStart: number,
): SyntaxNode | null {
    const cursor: TreeCursor = root.walk();
    let done = false;

    while (!done) {
        const node = cursor.currentNode;
        if (node.type === 'method_definition' && node.startPosition.row + 1 === lineStart) {
            const nameNode = node.childForFieldName('name');
            if (nameNode?.text === name) {
                const classNode = findParentClass(node);
                if (classNode) {
                    const classNameNode = classNode.childForFieldName('name');
                    if (classNameNode?.text === className) return node;
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

    return null;
}

function findParentClass(node: SyntaxNode): SyntaxNode | null {
    let parent = node.parent;
    while (parent) {
        if (parent.type === 'class_declaration' || parent.type === 'class') return parent;
        parent = parent.parent;
    }
    return null;
}

function analyzeCallable(
    symbolId: string,
    node: SyntaxNode,
    filePath: string,
    callGraph: Map<string, CallGraphEntry>,
    ctx: FlowContext,
): void {
    extractParameters(symbolId, node, filePath, ctx);
    extractReturnStatements(symbolId, node, filePath, ctx);
    extractFieldAccess(symbolId, node, filePath, ctx);
    detectAsyncCalls(symbolId, node, callGraph, ctx);
    detectErrorPaths(symbolId, node, filePath, ctx);
    markTaintOnParameters(symbolId, node, ctx);
}

function extractParameters(
    symbolId: string,
    node: SyntaxNode,
    filePath: string,
    ctx: FlowContext,
): void {
    const params = node.childForFieldName('parameters');
    if (!params) return;

    let paramIndex = 0;
    for (const param of params.children) {
        if (
            param.type === 'required_parameter' ||
            param.type === 'optional_parameter' ||
            param.type === 'identifier'
        ) {
            const nameNode =
                param.type === 'identifier'
                    ? param
                    : (param.childForFieldName('pattern') ??
                      param.children.find((c) => c.type === 'identifier'));
            if (!nameNode) continue;

            ctx.flowsTo.push({
                sourceId: symbolId,
                targetId: `param:${filePath}:${symbolId}:${nameNode.text}`,
                parameterIndex: paramIndex,
                transform: 'passthrough',
                taintLabel: null,
                confidence: 0.9,
                stage: 5,
                reason: 'parameter',
            });
            paramIndex++;
        }
    }
}

function extractReturnStatements(
    symbolId: string,
    node: SyntaxNode,
    _filePath: string,
    ctx: FlowContext,
): void {
    const returnNodes = collectNodes(node, 'return_statement');
    for (const ret of returnNodes) {
        if (isInsideNestedFunction(ret, node)) continue;

        const expr = ret.children.length > 1 ? ret.children[1] : null;
        const returnType = expr ? expr.type : null;

        ctx.returns.push({
            sourceId: symbolId,
            targetId: symbolId,
            line: ret.startPosition.row + 1,
            returnType,
            confidence: 0.9,
            stage: 5,
            reason: 'return',
        });
    }
}

function extractFieldAccess(
    symbolId: string,
    node: SyntaxNode,
    filePath: string,
    ctx: FlowContext,
): void {
    const memberExprs = collectNodes(node, 'member_expression');
    for (const mem of memberExprs) {
        if (isInsideNestedFunction(mem, node)) continue;

        const obj = mem.childForFieldName('object');
        const prop = mem.childForFieldName('property');
        if (!obj || !prop) continue;

        const field = prop.text;
        const parent = mem.parent;

        if (parent?.type === 'assignment_expression' && parent.childForFieldName('left') === mem) {
            ctx.writes.push({
                sourceId: symbolId,
                targetId: `field:${filePath}:${obj.text}.${field}`,
                line: mem.startPosition.row + 1,
                field,
                confidence: 0.85,
                stage: 5,
                reason: 'field_write',
            });
        } else if (parent?.type === 'member_expression' && isMutatingCall(parent)) {
            const outerProp = parent.childForFieldName('property');
            if (outerProp) {
                ctx.writes.push({
                    sourceId: symbolId,
                    targetId: `field:${filePath}:${obj.text}.${field}`,
                    line: mem.startPosition.row + 1,
                    field,
                    confidence: 0.8,
                    stage: 5,
                    reason: `field_write_via_${outerProp.text}`,
                });
            }
        } else if (
            parent?.type !== 'call_expression' ||
            parent.childForFieldName('function') !== mem
        ) {
            ctx.reads.push({
                sourceId: symbolId,
                targetId: `field:${filePath}:${obj.text}.${field}`,
                line: mem.startPosition.row + 1,
                field,
                confidence: 0.85,
                stage: 5,
                reason: isTaintSource(mem) ? 'taint_source' : 'field_read',
            });
        }
    }
}

function isTaintSource(node: SyntaxNode): boolean {
    return TAINT_SOURCE_PATTERNS.some((pattern) => node.text.startsWith(pattern));
}

const MUTATING_METHODS = new Set([
    'set',
    'push',
    'delete',
    'splice',
    'pop',
    'shift',
    'unshift',
    'add',
    'clear',
]);

function isMutatingCall(memberExpr: SyntaxNode): boolean {
    const prop = memberExpr.childForFieldName('property');
    if (!prop) return false;
    const parent = memberExpr.parent;
    if (parent?.type !== 'call_expression') return false;
    return MUTATING_METHODS.has(prop.text);
}

function markTaintOnParameters(symbolId: string, node: SyntaxNode, ctx: FlowContext): void {
    const memberExprs = collectNodes(node, 'member_expression');
    const hasTaintAccess = memberExprs.some((mem) => {
        if (isInsideNestedFunction(mem, node)) return false;
        return isTaintSource(mem);
    });

    if (!hasTaintAccess) return;

    for (const flow of ctx.flowsTo) {
        if (flow.sourceId === symbolId && flow.reason === 'parameter' && !flow.taintLabel) {
            flow.taintLabel = 'user_input';
        }
    }
}

function detectAsyncCalls(
    symbolId: string,
    node: SyntaxNode,
    callGraph: Map<string, CallGraphEntry>,
    ctx: FlowContext,
): void {
    const awaitExprs = collectNodes(node, 'await_expression');
    const entry = callGraph.get(symbolId);
    if (!entry) return;

    for (const awaitExpr of awaitExprs) {
        if (isInsideNestedFunction(awaitExpr, node)) continue;

        const callExpr = awaitExpr.children.find((c) => c.type === 'call_expression');
        if (!callExpr) continue;

        const fnNode = callExpr.childForFieldName('function');
        if (!fnNode) continue;

        const callName = extractCallName(fnNode);
        if (!callName) continue;

        for (const call of entry.callsFrom) {
            if (call.targetId.includes(callName)) {
                ctx.asyncCalls.push({ sourceId: symbolId, targetId: call.targetId });
            }
        }
    }
}

function extractCallName(node: SyntaxNode): string | null {
    if (node.type === 'identifier') return node.text;
    if (node.type === 'member_expression') {
        const prop = node.childForFieldName('property');
        return prop?.text ?? null;
    }
    return null;
}

function detectErrorPaths(
    symbolId: string,
    node: SyntaxNode,
    filePath: string,
    ctx: FlowContext,
): void {
    const tryCatches = collectNodes(node, 'try_statement');
    for (const tc of tryCatches) {
        if (isInsideNestedFunction(tc, node)) continue;

        ctx.flowsTo.push({
            sourceId: symbolId,
            targetId: `error:${filePath}:${symbolId}:try`,
            parameterIndex: null,
            transform: 'passthrough',
            taintLabel: null,
            confidence: 0.8,
            stage: 5,
            reason: 'try_catch',
        });
    }

    const throwStmts = collectNodes(node, 'throw_statement');
    for (const ts of throwStmts) {
        if (isInsideNestedFunction(ts, node)) continue;

        ctx.flowsTo.push({
            sourceId: symbolId,
            targetId: `error:${filePath}:${symbolId}:throw`,
            parameterIndex: null,
            transform: 'passthrough',
            taintLabel: null,
            confidence: 0.8,
            stage: 5,
            reason: 'throw',
        });
    }
}

function connectCrossCallFlows(
    _filePath: string,
    functions: FunctionNode[],
    methods: MethodNode[],
    callGraph: Map<string, CallGraphEntry>,
    ctx: FlowContext,
    root: SyntaxNode,
): void {
    const allCallables: CallableNode[] = [...functions, ...methods];

    for (const callable of allCallables) {
        const entry = callGraph.get(callable.id);
        if (!entry) continue;

        for (const call of entry.callsFrom) {
            const targetEntry = callGraph.get(call.targetId);
            if (!targetEntry) continue;

            const callExprNode = findCallExpressionAtLine(root, call.line);
            const args = callExprNode ? extractCallArguments(callExprNode) : [];

            for (let i = 0; i < args.length; i++) {
                const taintLabel = isTaintSourceText(args[i]) ? 'user_input' : null;
                ctx.flowsTo.push({
                    sourceId: callable.id,
                    targetId: call.targetId,
                    parameterIndex: i,
                    transform: 'passthrough',
                    taintLabel,
                    confidence: 0.85,
                    stage: 5,
                    reason: 'call_arg',
                });
            }

            ctx.returns.push({
                sourceId: call.targetId,
                targetId: callable.id,
                line: call.line,
                returnType: null,
                confidence: 0.85,
                stage: 5,
                reason: 'call_return',
            });
        }
    }
}

function findCallExpressionAtLine(root: SyntaxNode, line: number | null): SyntaxNode | null {
    if (line === null) return null;

    const cursor: TreeCursor = root.walk();
    let done = false;

    while (!done) {
        const node = cursor.currentNode;
        if (node.type === 'call_expression' && node.startPosition.row + 1 === line) {
            return node;
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

    return null;
}

function extractCallArguments(callExpr: SyntaxNode): string[] {
    const args = callExpr.childForFieldName('arguments');
    if (!args) return [];

    const result: string[] = [];
    for (const child of args.children) {
        if (child.type !== '(' && child.type !== ')' && child.type !== ',') {
            result.push(child.text);
        }
    }
    return result;
}

function isTaintSourceText(text: string): boolean {
    return TAINT_SOURCE_PATTERNS.some((p) => text.includes(p));
}

function propagateTaintLabels(flows: FlowsToEdge[]): void {
    const taintedSources = new Set<string>();

    for (const flow of flows) {
        if (flow.taintLabel) {
            taintedSources.add(flow.sourceId);
            taintedSources.add(flow.targetId);
        }
    }

    if (taintedSources.size === 0) return;

    let changed = true;
    let iterations = 0;
    const maxIterations = 10;

    while (changed && iterations < maxIterations) {
        changed = false;
        iterations++;

        for (const flow of flows) {
            if (!flow.taintLabel && taintedSources.has(flow.sourceId)) {
                flow.taintLabel = 'user_input';
                taintedSources.add(flow.targetId);
                changed = true;
            }
        }
    }
}

async function scoreEntryPoints(repo: CortexRepository, functions: FunctionNode[]): Promise<void> {
    for (const fn of functions) {
        let score = 0;

        if (ENTRY_POINT_PATTERNS.some((p) => p.test(fn.name))) {
            score += 0.3;
        }

        if (fn.isExported) {
            score += 0.1;
        }

        const callsFrom = await repo.getCallsFrom(fn.id);
        const callsTo = await repo.getCallsTo(fn.id);
        if (callsFrom.length > 0 && callsTo.length <= 1) {
            score += 0.2;
        }

        if (fn.isAsync) {
            score += 0.1;
        }

        if (score > 0) {
            await repo.updateEntryPointScore(fn.id, score, score > 0.5);
        }
    }
}

function collectNodes(root: SyntaxNode, type: string): SyntaxNode[] {
    const result: SyntaxNode[] = [];
    const cursor: TreeCursor = root.walk();
    let done = false;

    while (!done) {
        const node = cursor.currentNode;
        if (node.type === type) result.push(node);

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

    return result;
}

function isInsideNestedFunction(node: SyntaxNode, container: SyntaxNode): boolean {
    let parent = node.parent;
    while (parent && parent !== container) {
        if (
            parent.type === 'function_declaration' ||
            parent.type === 'function' ||
            parent.type === 'arrow_function' ||
            parent.type === 'method_definition'
        ) {
            return true;
        }
        parent = parent.parent;
    }
    return false;
}

async function discoverFlows(
    repo: CortexRepository,
    entryPoints: FunctionNode[],
    callGraph: Map<string, CallGraphEntry>,
): Promise<
    Array<{
        id: string;
        name: string;
        entryPointId: string;
        nodeIds: string[];
        hasAsync: boolean;
        hasErrorPath: boolean;
    }>
> {
    const flows: Array<{
        id: string;
        name: string;
        entryPointId: string;
        nodeIds: string[];
        hasAsync: boolean;
        hasErrorPath: boolean;
    }> = [];

    for (const ep of entryPoints) {
        const visited = new Set<string>();
        const queue: { id: string; depth: number }[] = [{ id: ep.id, depth: 0 }];
        let hasAsync = false;
        let hasErrorPath = false;

        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            if (visited.has(id) || depth > 10) continue;
            visited.add(id);

            const entry = callGraph.get(id);
            if (!entry) continue;

            for (const call of entry.callsFrom) {
                if (call.isAsync) hasAsync = true;
                if (!visited.has(call.targetId) && depth + 1 <= 10) {
                    queue.push({ id: call.targetId, depth: depth + 1 });
                }
            }

            const flowsTo = await repo.getFlowsFrom(id);
            for (const flow of flowsTo) {
                if (flow.reason === 'try_catch' || flow.reason === 'throw') {
                    hasErrorPath = true;
                }
            }
        }

        flows.push({
            id: `flow:${ep.id}`,
            name: ep.name,
            entryPointId: ep.id,
            nodeIds: [...visited],
            hasAsync,
            hasErrorPath,
        });
    }

    return flows;
}
