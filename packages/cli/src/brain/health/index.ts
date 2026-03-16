import type { Repository } from '../../storage/repository.js';
import type { SymbioteDB } from '../../storage/db.js';
import type { IntentStore } from '../intent.js';
import type { HealthReport, HealthSnapshot } from './types.js';
import { CycleDetector } from './cycle-detector.js';
import { DeadCodeDetector } from './dead-code-detector.js';
import { CouplingAnalyzer } from './coupling-analyzer.js';
import { ConstraintChecker } from './constraint-checker.js';
import { computeHealthScore } from './scorer.js';
import {
    HealthHistory,
    type SaveSnapshotInput,
} from './history.js';

export class HealthEngine {
    private cycleDetector: CycleDetector;
    private deadCodeDetector: DeadCodeDetector;
    private couplingAnalyzer: CouplingAnalyzer;
    private constraintChecker: ConstraintChecker;
    private history: HealthHistory;

    constructor(
        repo: Repository,
        intent: IntentStore,
        db: SymbioteDB
    ) {
        this.cycleDetector = new CycleDetector(repo);
        this.deadCodeDetector = new DeadCodeDetector(repo);
        this.couplingAnalyzer = new CouplingAnalyzer(repo);
        this.constraintChecker = new ConstraintChecker(
            repo,
            intent
        );
        this.history = new HealthHistory(db);
    }

    async analyze(): Promise<HealthReport> {
        const constraintResult = await this.constraintChecker.check();
        const circularDeps = await this.cycleDetector.detect();
        const deadCode = await this.deadCodeDetector.detect();
        const couplingHotspots = await this.couplingAnalyzer.detect();

        const scored = computeHealthScore({
            constraintViolations:
                constraintResult.violations.length,
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
            constraintScore:
                report.categories.constraints.score,
            circularDepScore:
                report.categories.circularDeps.score,
            deadCodeScore: report.categories.deadCode.score,
            couplingScore: report.categories.coupling.score,
            constraintViolationCount:
                report.constraintViolations.length,
            circularDepCount: report.circularDeps.length,
            deadCodeCount: report.deadCode.length,
            couplingHotspotCount:
                report.couplingHotspots.length,
        };
        await this.history.save(input);
    }

    async getHistory(limit: number): Promise<HealthSnapshot[]> {
        return this.history.list(limit);
    }

    async getLatestSnapshot(): Promise<HealthSnapshot | null> {
        return this.history.latest();
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
export { CycleDetector } from './cycle-detector.js';
export { DeadCodeDetector } from './dead-code-detector.js';
export { CouplingAnalyzer } from './coupling-analyzer.js';
export {
    ConstraintChecker,
    type ConstraintCheckResult,
} from './constraint-checker.js';
export {
    computeHealthScore,
    computeCategoryScore,
} from './scorer.js';
export {
    HealthHistory,
    type SaveSnapshotInput,
} from './history.js';
