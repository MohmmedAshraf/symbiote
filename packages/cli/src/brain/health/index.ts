import type { SymbioteDB } from '#storage/db.js';
import type { CortexRepository } from '#cortex/repository.js';
import type { NodeRecord, EdgeRecord } from '#storage/repository.js';
import type { IntentStore } from '../intent.js';
import type { HealthReport, HealthSnapshot } from './types.js';
import { CycleDetector } from './cycle-detector.js';
import { DeadCodeDetector } from './dead-code-detector.js';
import { CouplingAnalyzer } from './coupling-analyzer.js';
import { ConstraintChecker } from './constraint-checker.js';
import { computeHealthScore } from './scorer.js';
import { HealthHistory, type SaveSnapshotInput } from './history.js';

function isNonProductionFile(filePath: string): boolean {
    return /(^|\/)(?:test|dist|build|coverage|node_modules)\/|\.test\.|\.spec\./.test(filePath);
}

interface EdgeRow extends Record<string, unknown> {
    source_id: string;
    target_id: string;
}

const EDGE_TABLES: { table: string; type: string }[] = [
    { table: 'edges_calls', type: 'calls' },
    { table: 'edges_imports', type: 'imports' },
    { table: 'edges_extends', type: 'extends' },
    { table: 'edges_implements', type: 'implements' },
    { table: 'edges_contains', type: 'contains' },
    { table: 'edges_reads', type: 'reads' },
    { table: 'edges_writes', type: 'writes' },
    { table: 'edges_returns', type: 'returns' },
];

export class HealthEngine {
    private cortexRepo: CortexRepository;
    private db: SymbioteDB;
    private cycleDetector: CycleDetector;
    private deadCodeDetector: DeadCodeDetector;
    private couplingAnalyzer: CouplingAnalyzer;
    private constraintChecker: ConstraintChecker;
    private history: HealthHistory;

    constructor(cortexRepo: CortexRepository, intent: IntentStore, db: SymbioteDB) {
        this.cortexRepo = cortexRepo;
        this.db = db;
        this.cycleDetector = new CycleDetector();
        this.deadCodeDetector = new DeadCodeDetector();
        this.couplingAnalyzer = new CouplingAnalyzer();
        this.constraintChecker = new ConstraintChecker(intent);
        this.history = new HealthHistory(db);
    }

    async analyze(): Promise<HealthReport> {
        const [rawNodes, rawEdges] = await this.fetchGraphData();

        const prodNodes = rawNodes.filter((n) => !isNonProductionFile(n.filePath));
        const prodNodeIds = new Set(prodNodes.map((n) => n.id));
        const prodEdges = rawEdges.filter(
            (e) => prodNodeIds.has(e.sourceId) && prodNodeIds.has(e.targetId),
        );
        const preFetched = { nodes: prodNodes, edges: prodEdges };

        const allFilePaths = new Set<string>();
        for (const node of prodNodes) {
            allFilePaths.add(node.filePath);
        }

        const constraintResult = await this.constraintChecker.check(allFilePaths);
        const circularDeps = await this.cycleDetector.detect(preFetched);
        const deadCode = await this.deadCodeDetector.detect(preFetched);
        const couplingHotspots = await this.couplingAnalyzer.detect(preFetched);

        const scored = computeHealthScore({
            constraintViolations: constraintResult.violations.length,
            circularDeps: circularDeps.length,
            deadCode: deadCode.length,
            couplingHotspots: couplingHotspots.length,
        });

        return {
            score: scored.score,
            categories: scored.categories,
            constraintViolations: constraintResult.violations,
            descriptiveConstraints: constraintResult.descriptive,
            circularDeps,
            deadCode,
            couplingHotspots,
            timestamp: new Date().toISOString(),
        };
    }

    async saveSnapshot(report: HealthReport): Promise<void> {
        const input: SaveSnapshotInput = {
            score: report.score,
            constraintScore: report.categories.constraints.score,
            circularDepScore: report.categories.circularDeps.score,
            deadCodeScore: report.categories.deadCode.score,
            couplingScore: report.categories.coupling.score,
            constraintViolationCount: report.constraintViolations.length,
            circularDepCount: report.circularDeps.length,
            deadCodeCount: report.deadCode.length,
            couplingHotspotCount: report.couplingHotspots.length,
        };
        await this.history.save(input);
    }

    async getHistory(limit: number): Promise<HealthSnapshot[]> {
        return this.history.list(limit);
    }

    async getLatestSnapshot(): Promise<HealthSnapshot | null> {
        return this.history.latest();
    }

    private async fetchGraphData(): Promise<[NodeRecord[], EdgeRecord[]]> {
        const symbols = await this.cortexRepo.getAllSymbols();
        const nodes: NodeRecord[] = symbols.map((s) => ({
            id: s.id,
            type: s.kind,
            name: s.name,
            filePath: s.filePath,
            lineStart: s.lineStart,
            lineEnd: s.lineEnd,
            isExported: s.isExported,
        }));

        const edges: EdgeRecord[] = [];
        for (const { table, type } of EDGE_TABLES) {
            const rows = await this.db.all<EdgeRow>(`SELECT source_id, target_id FROM ${table}`);
            for (const row of rows) {
                edges.push({
                    sourceId: row.source_id,
                    targetId: row.target_id,
                    type,
                });
            }
        }

        return [nodes, edges];
    }
}

export type {
    HealthReport,
    HealthSnapshot,
    ConstraintViolation,
    DescriptiveConstraint,
    CircularDep,
    DeadCodeEntry,
    CouplingHotspot,
    CategoryScore,
} from './types.js';
