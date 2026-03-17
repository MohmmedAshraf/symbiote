import { describe, it, expect } from 'vitest';
import { parsePackageJson } from '#init/parsers/package-json.js';
import type { TechStackEntry } from '#init/parsers/types.js';

describe('parsePackageJson', () => {
    it('detects Next.js as framework', () => {
        const result = parsePackageJson({
            dependencies: { next: '^14.0.0' },
        });
        const nextEntry = result.techStack.find((t: TechStackEntry) => t.name === 'Next.js');
        expect(nextEntry).toBeDefined();
        expect(nextEntry!.category).toBe('framework');
    });

    it('detects Drizzle as ORM', () => {
        const result = parsePackageJson({
            dependencies: { 'drizzle-orm': '^0.30.0' },
        });
        const drizzle = result.techStack.find((t: TechStackEntry) => t.name === 'Drizzle');
        expect(drizzle).toBeDefined();
        expect(drizzle!.category).toBe('orm');
    });

    it('detects Vitest as testing', () => {
        const result = parsePackageJson({
            devDependencies: { vitest: '^1.0.0' },
        });
        const vitest = result.techStack.find((t: TechStackEntry) => t.name === 'Vitest');
        expect(vitest).toBeDefined();
        expect(vitest!.category).toBe('testing');
    });

    it('detects Tailwind as styling', () => {
        const result = parsePackageJson({
            devDependencies: { tailwindcss: '^3.4.0' },
        });
        const tailwind = result.techStack.find((t: TechStackEntry) => t.name === 'Tailwind');
        expect(tailwind).toBeDefined();
        expect(tailwind!.category).toBe('styling');
    });

    it('extracts versions from dependencies', () => {
        const result = parsePackageJson({
            dependencies: { next: '^14.2.1' },
        });
        const nextEntry = result.techStack.find((t: TechStackEntry) => t.name === 'Next.js');
        expect(nextEntry!.version).toBe('14.2.1');
    });

    it('creates decision rules for detected tech', () => {
        const result = parsePackageJson({
            dependencies: { next: '^14.0.0' },
            devDependencies: { vitest: '^1.0.0' },
        });
        expect(result.rules.length).toBeGreaterThanOrEqual(2);
        for (const rule of result.rules) {
            expect(rule.classification).toBe('decision');
            expect(rule.source).toBe('package.json');
        }
    });

    it('extracts description and name', () => {
        const result = parsePackageJson({
            name: 'my-app',
            description: 'A cool project',
        });
        expect(result.name).toBe('my-app');
        expect(result.description).toBe('A cool project');
    });

    it('handles empty package.json', () => {
        const result = parsePackageJson({});
        expect(result.techStack).toEqual([]);
        expect(result.rules).toEqual([]);
        expect(result.name).toBeUndefined();
        expect(result.description).toBeUndefined();
    });
});
