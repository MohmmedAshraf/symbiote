import { walkFiles, hashFileContent } from '../utils/files.js';
import { parseFile } from './parser.js';
import { GraphAlgorithms } from './algorithms.js';
import type { Repository } from '../storage/repository.js';

export interface ScanOptions {
    force?: boolean;
    skipAlgorithms?: boolean;
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
                    !(await this.repo.isFileChanged(filePath, hash))
                ) {
                    result.filesSkipped++;
                    continue;
                }

                const parsed = parseFile(filePath);
                if (!parsed) {
                    result.filesSkipped++;
                    continue;
                }

                await this.repo.clearNodesForFile(filePath);
                await this.repo.insertNodes(parsed.nodes);
                await this.repo.insertEdges(parsed.edges);
                await this.repo.upsertFile(filePath, hash);

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

        if (!options.skipAlgorithms && result.filesScanned > 0) {
            try {
                const algorithms = new GraphAlgorithms(this.repo);
                await algorithms.runAll();
            } catch {
                // Algorithm failures are non-fatal
            }
        }

        return result;
    }
}
