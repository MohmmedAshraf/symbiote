import { walkFiles, hashFileContent } from '../utils/files.js';
import { parseFile } from './parser.js';
import type { Repository } from '../storage/repository.js';

export interface ScanOptions {
    force?: boolean;
}

export interface ScanResult {
    filesScanned: number;
    filesSkipped: number;
    nodesCreated: number;
    edgesCreated: number;
    errors: Array<{ file: string; error: string }>;
}

export class Scanner {
    constructor(private repo: Repository) {}

    async scan(
        rootDir: string,
        options: ScanOptions = {}
    ): Promise<ScanResult> {
        const files = walkFiles(rootDir);
        const result: ScanResult = {
            filesScanned: 0,
            filesSkipped: 0,
            nodesCreated: 0,
            edgesCreated: 0,
            errors: [],
        };

        for (const filePath of files) {
            try {
                const hash = hashFileContent(filePath);

                if (
                    !options.force &&
                    !this.repo.isFileChanged(filePath, hash)
                ) {
                    result.filesSkipped++;
                    continue;
                }

                const parsed = parseFile(filePath);
                if (!parsed) {
                    result.filesSkipped++;
                    continue;
                }

                this.repo.clearNodesForFile(filePath);
                this.repo.insertNodes(parsed.nodes);
                this.repo.insertEdges(parsed.edges);
                this.repo.upsertFile(filePath, hash);

                result.filesScanned++;
                result.nodesCreated += parsed.nodes.length;
                result.edgesCreated += parsed.edges.length;
            } catch (error) {
                result.errors.push({
                    file: filePath,
                    error:
                        error instanceof Error
                            ? error.message
                            : String(error),
                });
            }
        }

        return result;
    }
}
