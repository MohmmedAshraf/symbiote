import path from 'node:path';
import { DnaStorage } from '../dna/storage.js';
import { DnaEngine } from '../dna/engine.js';
import type { DnaEntry } from '../dna/types.js';
import type { ClassifiedRule } from './parsers/types.js';

export interface DnaBootstrapResult {
    existingEntries: number;
    loadedEntries: DnaEntry[];
    importedEntries: number;
    skippedEntries: number;
}

export function bootstrapDna(
    symbioteHome: string,
    newRules?: ClassifiedRule[],
): DnaBootstrapResult {
    const dnaDir = path.join(symbioteHome, 'dna');
    const storage = new DnaStorage(dnaDir);
    storage.ensureDirectories();

    const existing = storage.listEntries();
    const result: DnaBootstrapResult = {
        existingEntries: existing.length,
        loadedEntries: existing,
        importedEntries: 0,
        skippedEntries: 0,
    };

    if (!newRules || newRules.length === 0) return result;

    const dnaRules = newRules.filter((r) => r.target === 'dna');
    const engine = new DnaEngine(storage);
    const existingIds = new Set(existing.map((e) => e.frontmatter.id));

    for (const rule of dnaRules) {
        const category = DnaEngine.classifyCategory(rule.text);
        const id = DnaEngine.generateId(category, rule.text);

        if (existingIds.has(id)) {
            result.skippedEntries++;
            continue;
        }

        engine.captureInstruction(rule.text, `init-${rule.source}`, 'explicit');
        result.importedEntries++;
    }

    return result;
}
