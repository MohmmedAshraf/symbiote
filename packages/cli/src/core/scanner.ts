import fs from 'node:fs/promises';
import { walkFiles, hashFileContent } from '../utils/files.js';
import { parseFile } from './parser.js';
import { EmbeddingService } from './embeddings.js';
import { GraphAlgorithms } from './algorithms.js';
import type { Repository } from '../storage/repository.js';
import type { SymbioteDB } from '../storage/db.js';

export interface ScanOptions {
    force?: boolean;
    embeddings?: boolean;
    skipAlgorithms?: boolean;
}

export interface ScanResult {
    filesScanned: number;
    filesSkipped: number;
    nodesCreated: number;
    edgesCreated: number;
    embeddingsGenerated: number;
    errors: Array<{ file: string; error: string }>;
}

export class Scanner {
    private embeddingService: EmbeddingService | null = null;

    constructor(
        private repo: Repository,
        private db?: SymbioteDB,
    ) {}

    async scan(rootDir: string, options: ScanOptions = {}): Promise<ScanResult> {
        const files = await walkFiles(rootDir);
        const result: ScanResult = {
            filesScanned: 0,
            filesSkipped: 0,
            nodesCreated: 0,
            edgesCreated: 0,
            embeddingsGenerated: 0,
            errors: [],
        };

        if (options.embeddings && this.db) {
            this.embeddingService = new EmbeddingService();
            await this.embeddingService.initialize();
        }

        for (const filePath of files) {
            try {
                const source = await fs.readFile(filePath, 'utf-8');
                const hash = hashFileContent(filePath, source);

                if (!options.force && !(await this.repo.isFileChanged(filePath, hash))) {
                    result.filesSkipped++;
                    continue;
                }

                const parsed = parseFile(filePath, source);
                if (!parsed) {
                    result.filesSkipped++;
                    continue;
                }

                await this.repo.updateFileNodes(filePath, hash, parsed.nodes, parsed.edges);

                if (this.embeddingService && this.db) {
                    await this.embeddingService.clearForFile(this.db, filePath);
                    result.embeddingsGenerated += await this.embeddingService.generateForNodes(
                        this.db,
                        parsed.nodes,
                        new Map([[filePath, source]]),
                    );
                }

                result.filesScanned++;
                result.nodesCreated += parsed.nodes.length;
                result.edgesCreated += parsed.edges.length;
            } catch (error) {
                result.errors.push({
                    file: filePath,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        this.embeddingService?.dispose();
        this.embeddingService = null;

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
