import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { getGrammar } from '#core/languages.js';
import { CortexRepository } from './repository.js';
import type {
    StageResult,
    StageError,
    ImportsEdge,
    ImportKind,
    SymbolTableEntry,
    SymbolTable,
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
}

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];

function parseToRoot(content: string, grammar: unknown): SyntaxNode {
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(content);
    return tree.rootNode as SyntaxNode;
}

interface RawImport {
    kind: ImportKind;
    originalName: string | null;
    localName: string | null;
    alias: string | null;
    sourcePath: string;
    line: number;
}

export async function runStage2(
    repo: CortexRepository,
    rootDir: string,
    options?: { force?: boolean; targetFiles?: string[] },
): Promise<StageResult> {
    const start = Date.now();
    const errors: StageError[] = [];
    let filesProcessed = 0;
    let edgesCreated = 0;

    const files = options?.force ? await repo.getAllFileNodes() : await repo.getFilesByMaxDepth(2);

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
                stage: 2,
                message: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        const grammar = getGrammar(file.language);
        if (!grammar) continue;

        let rawImports: RawImport[];
        try {
            rawImports = extractImports(content, grammar);
        } catch (err) {
            errors.push({
                filePath: file.path,
                stage: 2,
                message: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        const fileId = `file:${file.path}`;
        const fileDir = dirname(file.path);
        const edges: ImportsEdge[] = [];
        const symbolTable: SymbolTable = new Map();

        for (const raw of rawImports) {
            if (!raw.sourcePath.startsWith('.')) continue;

            const resolvedAbs = resolveImportPath(rootDir, fileDir, raw.sourcePath);
            const resolvedRel = resolvedAbs ? relative(rootDir, resolvedAbs) : null;
            const confidence = resolvedRel ? 1.0 : 0.5;
            const targetId = resolvedRel ? `file:${resolvedRel}` : `file:${raw.sourcePath}`;

            edges.push({
                sourceId: fileId,
                targetId,
                line: raw.line,
                kind: raw.kind,
                originalName: raw.originalName,
                alias: raw.alias,
                confidence,
                stage: 2,
                reason: null,
            });

            if (raw.localName && resolvedRel) {
                const entry: SymbolTableEntry = {
                    localName: raw.localName,
                    originalName: raw.originalName ?? raw.localName,
                    sourcePath: raw.sourcePath,
                    resolvedSourcePath: resolvedRel,
                    kind: raw.kind,
                };
                symbolTable.set(raw.localName, entry);
            }

            if (raw.kind === 're_export' && !raw.originalName && resolvedRel) {
                const exported = collectExportedSymbols(resolvedRel, rootDir, new Set());
                for (const sym of exported) {
                    symbolTable.set(sym.name, {
                        localName: sym.name,
                        originalName: sym.name,
                        sourcePath: raw.sourcePath,
                        resolvedSourcePath: sym.sourceFile,
                        kind: 're_export',
                    });
                }
            }
        }

        resolveReExportChains(symbolTable, rootDir, new Set());

        if (edges.length > 0) {
            await repo.insertImportsEdges(edges);
            edgesCreated += edges.length;
        }

        if (symbolTable.size > 0) {
            await repo.setSymbolTable(fileId, symbolTable);
        }

        await repo.upsertFileNode({ ...file, depthLevel: 2 });
        filesProcessed++;
    }

    return {
        stage: 2,
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

function extractImports(content: string, grammar: unknown): RawImport[] {
    const root = parseToRoot(content, grammar);
    const imports: RawImport[] = [];

    for (const node of root.children) {
        if (node.type === 'import_statement') {
            extractImportStatement(node, imports);
        } else if (node.type === 'export_statement') {
            extractReExport(node, imports);
        } else if (node.type === 'expression_statement') {
            extractDynamicImport(node, imports);
        }
    }

    return imports;
}

function extractImportStatement(node: SyntaxNode, imports: RawImport[]): void {
    const source = node.childForFieldName('source');
    if (!source) return;
    const sourcePath = source.text.replace(/['"]/g, '');
    const line = node.startPosition.row + 1;

    const importClause = node.children.find((c) => c.type === 'import_clause');
    if (!importClause) return;

    for (const clause of importClause.children) {
        if (clause.type === 'named_imports') {
            for (const spec of clause.children) {
                if (spec.type !== 'import_specifier') continue;
                const nameNode = spec.childForFieldName('name');
                if (!nameNode) continue;
                const aliasNode = spec.childForFieldName('alias');
                const originalName = nameNode.text;
                const localName = aliasNode?.text ?? originalName;
                imports.push({
                    kind: 'named',
                    originalName,
                    localName,
                    alias: aliasNode ? aliasNode.text : null,
                    sourcePath,
                    line,
                });
            }
        } else if (clause.type === 'namespace_import') {
            const nameNode = clause.children.find((c) => c.type === 'identifier');
            if (nameNode) {
                imports.push({
                    kind: 'namespace',
                    originalName: null,
                    localName: nameNode.text,
                    alias: null,
                    sourcePath,
                    line,
                });
            }
        } else if (clause.type === 'identifier') {
            imports.push({
                kind: 'default',
                originalName: 'default',
                localName: clause.text,
                alias: null,
                sourcePath,
                line,
            });
        }
    }
}

function extractReExport(node: SyntaxNode, imports: RawImport[]): void {
    const source = node.childForFieldName('source');
    if (!source) return;
    const sourcePath = source.text.replace(/['"]/g, '');
    const line = node.startPosition.row + 1;

    const hasWildcard =
        node.children.some((c) => c.type === 'export_clause' && c.text === '*') ||
        node.children.some((c) => c.type === '*');

    if (hasWildcard) {
        imports.push({
            kind: 're_export',
            originalName: null,
            localName: null,
            alias: null,
            sourcePath,
            line,
        });
        return;
    }

    const exportClause = node.children.find((c) => c.type === 'export_clause');
    if (exportClause) {
        for (const spec of exportClause.children) {
            if (spec.type !== 'export_specifier') continue;
            const nameNode = spec.childForFieldName('name');
            if (!nameNode) continue;
            const aliasNode = spec.childForFieldName('alias');
            imports.push({
                kind: 're_export',
                originalName: nameNode.text,
                localName: aliasNode?.text ?? nameNode.text,
                alias: aliasNode ? aliasNode.text : null,
                sourcePath,
                line,
            });
        }
    }
}

function extractDynamicImport(node: SyntaxNode, imports: RawImport[]): void {
    const line = node.startPosition.row + 1;
    findDynamicImports(node, imports, line);
}

function findDynamicImports(node: SyntaxNode, imports: RawImport[], line: number): void {
    if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (fn?.type === 'import') {
            const args = node.childForFieldName('arguments');
            if (args) {
                const firstArg = args.children.find(
                    (c) => c.type === 'string' || c.type === 'template_string',
                );
                if (firstArg) {
                    const sourcePath = firstArg.text.replace(/['"`]/g, '');
                    imports.push({
                        kind: 'dynamic',
                        originalName: null,
                        localName: null,
                        alias: null,
                        sourcePath,
                        line,
                    });
                }
            }
        }
    }
    for (const child of node.children) {
        findDynamicImports(child, imports, line);
    }
}

function resolveImportPath(rootDir: string, fileDir: string, importPath: string): string | null {
    const absDir = resolve(rootDir, fileDir);
    const base = resolve(absDir, importPath);

    if (existsSync(base) && !isDirectory(base)) {
        return base;
    }

    for (const ext of EXTENSIONS) {
        const candidate = base + ext;
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

function isDirectory(p: string): boolean {
    try {
        const { statSync } = require('node:fs') as typeof import('node:fs');
        return statSync(p).isDirectory();
    } catch {
        return false;
    }
}

function resolveReExportChains(
    symbolTable: SymbolTable,
    rootDir: string,
    visited: Set<string>,
): void {
    for (const [key, entry] of symbolTable) {
        const trueSource = followReExports(
            entry.originalName,
            entry.resolvedSourcePath,
            rootDir,
            visited,
        );
        if (trueSource && trueSource !== entry.resolvedSourcePath) {
            symbolTable.set(key, { ...entry, resolvedSourcePath: trueSource });
        }
    }
}

function followReExports(
    symbolName: string,
    relPath: string,
    rootDir: string,
    visited: Set<string>,
): string | null {
    if (visited.has(relPath)) return relPath;
    visited.add(relPath);

    const absPath = resolve(rootDir, relPath);
    let content: string;
    try {
        content = readFileSync(absPath, 'utf-8');
    } catch {
        return relPath;
    }

    const language = detectLangFromPath(relPath);
    if (!language) return relPath;

    const grammar = getGrammar(language);
    if (!grammar) return relPath;

    const root = parseToRoot(content, grammar);

    for (const node of root.children) {
        if (node.type !== 'export_statement') continue;
        const source = node.childForFieldName('source');
        if (!source) continue;

        const sourcePath = source.text.replace(/['"]/g, '');
        if (!sourcePath.startsWith('.')) continue;

        const resolvedAbs = resolveImportPath(rootDir, dirname(relPath), sourcePath);
        if (!resolvedAbs) continue;
        const resolvedRel = relative(rootDir, resolvedAbs);

        const hasWildcard = node.children.some((c: SyntaxNode) => c.type === '*');
        if (hasWildcard) {
            const deeper = followReExports(symbolName, resolvedRel, rootDir, visited);
            if (deeper && fileExportsSymbol(deeper, symbolName, rootDir)) {
                return deeper;
            }
            continue;
        }

        const exportClause = node.children.find((c: SyntaxNode) => c.type === 'export_clause');
        if (exportClause) {
            for (const spec of exportClause.children) {
                if (spec.type !== 'export_specifier') continue;
                const nameNode = spec.childForFieldName('name');
                const aliasNode = spec.childForFieldName('alias');
                const exportedName = aliasNode?.text ?? nameNode?.text;
                if (exportedName === symbolName && nameNode) {
                    return followReExports(nameNode.text, resolvedRel, rootDir, visited);
                }
            }
        }
    }

    return relPath;
}

function fileExportsSymbol(relPath: string, symbolName: string, rootDir: string): boolean {
    const absPath = resolve(rootDir, relPath);
    let content: string;
    try {
        content = readFileSync(absPath, 'utf-8');
    } catch {
        return false;
    }

    const language = detectLangFromPath(relPath);
    if (!language) return false;

    const grammar = getGrammar(language);
    if (!grammar) return false;

    const root = parseToRoot(content, grammar);

    for (const node of root.children) {
        if (node.type === 'export_statement') {
            const declaration = node.childForFieldName('declaration');
            if (declaration) {
                const nameNode = declaration.childForFieldName('name');
                if (nameNode?.text === symbolName) return true;
            }

            const source = node.childForFieldName('source');
            if (source) {
                const hasWildcard = node.children.some((c: SyntaxNode) => c.type === '*');
                if (hasWildcard) {
                    const sourcePath = source.text.replace(/['"]/g, '');
                    if (sourcePath.startsWith('.')) {
                        const resolvedAbs = resolveImportPath(
                            rootDir,
                            dirname(relPath),
                            sourcePath,
                        );
                        if (resolvedAbs) {
                            const resolvedRel = relative(rootDir, resolvedAbs);
                            if (fileExportsSymbol(resolvedRel, symbolName, rootDir)) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
    }

    return false;
}

interface ExportedSymbol {
    name: string;
    sourceFile: string;
}

function collectExportedSymbols(
    relPath: string,
    rootDir: string,
    visited: Set<string>,
): ExportedSymbol[] {
    if (visited.has(relPath)) return [];
    visited.add(relPath);

    const absPath = resolve(rootDir, relPath);
    let content: string;
    try {
        content = readFileSync(absPath, 'utf-8');
    } catch {
        return [];
    }

    const language = detectLangFromPath(relPath);
    if (!language) return [];

    const grammar = getGrammar(language);
    if (!grammar) return [];

    const root = parseToRoot(content, grammar);

    const symbols: ExportedSymbol[] = [];

    for (const node of root.children) {
        if (node.type !== 'export_statement') continue;

        const source = node.childForFieldName('source');
        if (source) {
            const sourcePath = source.text.replace(/['"]/g, '');
            if (!sourcePath.startsWith('.')) continue;

            const resolvedAbs = resolveImportPath(rootDir, dirname(relPath), sourcePath);
            if (!resolvedAbs) continue;
            const resolvedRel = relative(rootDir, resolvedAbs);

            const hasWildcard = node.children.some((c: SyntaxNode) => c.type === '*');
            if (hasWildcard) {
                symbols.push(...collectExportedSymbols(resolvedRel, rootDir, visited));
                continue;
            }

            const exportClause = node.children.find((c: SyntaxNode) => c.type === 'export_clause');
            if (exportClause) {
                for (const spec of exportClause.children) {
                    if (spec.type !== 'export_specifier') continue;
                    const nameNode = spec.childForFieldName('name');
                    const aliasNode = spec.childForFieldName('alias');
                    if (nameNode) {
                        symbols.push({
                            name: aliasNode?.text ?? nameNode.text,
                            sourceFile: resolvedRel,
                        });
                    }
                }
            }
            continue;
        }

        const declaration = node.childForFieldName('declaration');
        if (declaration) {
            const nameNode = declaration.childForFieldName('name');
            if (nameNode) {
                symbols.push({ name: nameNode.text, sourceFile: relPath });
            }
        }
    }

    return symbols;
}

function detectLangFromPath(filePath: string): string | null {
    if (filePath.endsWith('.ts')) return 'typescript';
    if (filePath.endsWith('.tsx')) return 'tsx';
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'javascript';
    if (filePath.endsWith('.jsx')) return 'javascript';
    return null;
}
