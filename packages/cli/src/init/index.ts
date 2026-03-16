import fs from 'node:fs';
import path from 'node:path';
import { importRules } from './rule-importer.js';
import { analyzeProject } from './project-analyzer.js';
import { bootstrapDna } from './dna-bootstrap.js';
import { generateSmartOverview } from './overview-generator.js';
import { IntentStore } from '../brain/intent.js';
import type { IntentEntry, IntentType } from '../brain/intent.js';
import type { ClassifiedRule, TechStackEntry, ArchitectureSignal } from './parsers/types.js';
import type { ScanResult } from '../core/scanner.js';

export interface SmartInitOptions {
    projectRoot: string;
    symbioteHome: string;
    brainDir: string;
    scanResult?: ScanResult;
}

export interface SmartInitResult {
    rulesImported: number;
    techStack: TechStackEntry[];
    architectureSignals: ArchitectureSignal[];
    entryPoints: string[];
    dnaEntriesLoaded: number;
    dnaEntriesImported: number;
    intentEntriesCreated: number;
    overviewGenerated: boolean;
}

const DEFAULT_SCAN_RESULT: ScanResult = {
    filesScanned: 0,
    filesSkipped: 0,
    nodesCreated: 0,
    edgesCreated: 0,
    embeddingsGenerated: 0,
    errors: [],
};

export class SmartInit {
    private projectRoot: string;
    private symbioteHome: string;
    private brainDir: string;
    private scanResult: ScanResult;

    constructor(options: SmartInitOptions) {
        this.projectRoot = options.projectRoot;
        this.symbioteHome = options.symbioteHome;
        this.brainDir = options.brainDir;
        this.scanResult = options.scanResult ?? DEFAULT_SCAN_RESULT;
    }

    run(): SmartInitResult {
        const rules = importRules(this.projectRoot);
        const analysis = analyzeProject(this.projectRoot);
        const intentCount = this.writeIntentEntries(rules);
        const dnaResult = bootstrapDna(this.symbioteHome, rules);
        const projectName = path.basename(this.projectRoot);
        const overviewContent = generateSmartOverview(
            projectName,
            analysis,
            this.scanResult,
            rules,
        );
        this.writeOverview(overviewContent);

        return {
            rulesImported: rules.length,
            techStack: analysis.techStack,
            architectureSignals: analysis.architecture,
            entryPoints: analysis.entryPoints,
            dnaEntriesLoaded: dnaResult.existingEntries,
            dnaEntriesImported: dnaResult.importedEntries,
            intentEntriesCreated: intentCount,
            overviewGenerated: true,
        };
    }

    private writeIntentEntries(rules: ClassifiedRule[]): number {
        const intentRules = rules.filter((r) => r.target === 'intent');
        if (intentRules.length === 0) return 0;

        const store = new IntentStore(this.brainDir);
        let count = 0;

        for (const rule of intentRules) {
            const type: IntentType = rule.classification === 'decision' ? 'decision' : 'constraint';
            const id = `${type}-${slugify(rule.text)}`;

            const existing = store.readEntry(id);
            if (existing) continue;

            const entry: IntentEntry = {
                frontmatter: {
                    id,
                    type,
                    scope: 'global',
                    status: 'active',
                    author: `init-${rule.source}`,
                    createdAt: new Date().toISOString().split('T')[0],
                },
                content: rule.text,
            };

            store.writeEntry(entry);
            count++;
        }

        return count;
    }

    private writeOverview(content: string): void {
        const overviewDir = path.join(this.brainDir, 'intent');
        fs.mkdirSync(overviewDir, { recursive: true });
        fs.writeFileSync(path.join(overviewDir, 'overview.md'), content);
    }
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50)
        .replace(/-$/, '');
}
