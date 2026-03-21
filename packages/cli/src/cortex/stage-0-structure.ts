import path from 'node:path';
import { readFileSync } from 'node:fs';
import { walkFiles } from '#utils/files.js';
import { detectLanguage } from '#core/languages.js';
import { hashFileContent } from '#utils/files.js';
import { CortexRepository } from './repository.js';
import type { StageResult, StageError, FileNode, ModuleNode, ContainsEdge } from './types.js';

const RE_EXPORT_PATTERN = /^\s*export\s+(\*|\{[^}]*\})\s+from\s+['"][^'"]+['"]\s*;?\s*$/;
const EMPTY_OR_COMMENT = /^\s*($|\/\/|\/\*|\*)/;

function isBarrelFile(content: string): boolean {
    const lines = content.split('\n');
    let hasExport = false;
    for (const line of lines) {
        if (EMPTY_OR_COMMENT.test(line)) continue;
        if (RE_EXPORT_PATTERN.test(line)) {
            hasExport = true;
            continue;
        }
        return false;
    }
    return hasExport;
}

export async function runStage0(
    repo: CortexRepository,
    rootDir: string,
    options?: { force?: boolean; targetFiles?: string[] },
): Promise<StageResult> {
    const start = Date.now();
    const errors: StageError[] = [];
    let filesProcessed = 0;
    let nodesCreated = 0;
    let edgesCreated = 0;

    const absolutePaths = options?.targetFiles
        ? options.targetFiles.map((f) => path.resolve(rootDir, f))
        : await walkFiles(rootDir);

    const fileNodes: FileNode[] = [];
    const moduleNodes: Map<string, ModuleNode> = new Map();
    const containsEdges: ContainsEdge[] = [];

    for (const absPath of absolutePaths) {
        const relPath = path.relative(rootDir, absPath);
        const fileId = `file:${relPath}`;
        const language = detectLanguage(absPath);

        let content: string;
        try {
            content = readFileSync(absPath, 'utf-8');
        } catch (err) {
            errors.push({
                filePath: relPath,
                stage: 0,
                message: err instanceof Error ? err.message : String(err),
            });
            continue;
        }

        const hash = hashFileContent(absPath, content);

        if (!options?.force && !(await repo.isFileChanged(fileId, hash))) {
            continue;
        }

        filesProcessed++;

        fileNodes.push({
            id: fileId,
            path: relPath,
            hash,
            language,
            depthLevel: 0,
            lastIndexed: new Date(),
        });

        const dir = path.dirname(relPath);
        const moduleId = `module:${dir === '.' ? relPath : dir}`;
        const barrel =
            language === 'typescript' || language === 'javascript' ? isBarrelFile(content) : false;

        if (dir === '.') {
            if (!moduleNodes.has(moduleId)) {
                moduleNodes.set(moduleId, {
                    id: `module:${relPath}`,
                    path: relPath,
                    isBarrel: barrel,
                });
            } else if (barrel) {
                moduleNodes.get(moduleId)!.isBarrel = true;
            }
        }

        if (dir !== '.') {
            if (!moduleNodes.has(moduleId)) {
                moduleNodes.set(moduleId, {
                    id: moduleId,
                    path: dir,
                    isBarrel: barrel,
                });
            } else if (barrel) {
                moduleNodes.get(moduleId)!.isBarrel = true;
            }
        }

        containsEdges.push({
            sourceId: dir === '.' ? `module:${relPath}` : moduleId,
            targetId: fileId,
            confidence: 1.0,
            stage: 0,
            reason: null,
        });
    }

    for (const node of fileNodes) {
        await repo.upsertFileNode(node);
        nodesCreated++;
    }

    const modules = Array.from(moduleNodes.values());
    if (modules.length > 0) {
        await repo.insertModuleNodes(modules);
        nodesCreated += modules.length;
    }

    if (containsEdges.length > 0) {
        await repo.insertContainsEdges(containsEdges);
        edgesCreated += containsEdges.length;
    }

    return {
        stage: 0,
        filesProcessed,
        nodesCreated,
        edgesCreated,
        durationMs: Date.now() - start,
        errors,
    };
}
