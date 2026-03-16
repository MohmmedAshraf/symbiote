import type { ParsedRule, TechStackEntry } from './types.js';

interface DetectionRule {
    package: string | string[];
    name: string;
    category: TechStackEntry['category'];
}

const DETECTION_RULES: DetectionRule[] = [
    { package: 'next', name: 'Next.js', category: 'framework' },
    { package: 'react', name: 'React', category: 'framework' },
    { package: 'vue', name: 'Vue', category: 'framework' },
    { package: ['@angular/core', '@angular/cli'], name: 'Angular', category: 'framework' },
    { package: 'svelte', name: 'Svelte', category: 'framework' },
    { package: 'express', name: 'Express', category: 'framework' },
    { package: 'fastify', name: 'Fastify', category: 'framework' },
    { package: 'hono', name: 'Hono', category: 'framework' },
    { package: 'drizzle-orm', name: 'Drizzle', category: 'orm' },
    { package: 'prisma', name: 'Prisma', category: 'orm' },
    { package: 'typeorm', name: 'TypeORM', category: 'orm' },
    { package: 'mongoose', name: 'Mongoose', category: 'orm' },
    { package: 'vitest', name: 'Vitest', category: 'testing' },
    { package: 'jest', name: 'Jest', category: 'testing' },
    { package: 'mocha', name: 'Mocha', category: 'testing' },
    { package: ['@playwright/test', 'playwright'], name: 'Playwright', category: 'testing' },
    { package: 'cypress', name: 'Cypress', category: 'testing' },
    { package: 'tailwindcss', name: 'Tailwind', category: 'styling' },
    { package: 'styled-components', name: 'styled-components', category: 'styling' },
    { package: '@emotion/react', name: 'Emotion', category: 'styling' },
    { package: 'sass', name: 'Sass', category: 'styling' },
    { package: 'typescript', name: 'TypeScript', category: 'language' },
    { package: 'vite', name: 'Vite', category: 'bundler' },
    { package: 'webpack', name: 'Webpack', category: 'bundler' },
    { package: 'turbo', name: 'Turborepo', category: 'bundler' },
    { package: 'esbuild', name: 'esbuild', category: 'bundler' },
    { package: 'eslint', name: 'ESLint', category: 'linter' },
    { package: '@biomejs/biome', name: 'Biome', category: 'linter' },
    { package: 'stripe', name: 'Stripe', category: 'library' },
    { package: 'zod', name: 'Zod', category: 'library' },
    { package: ['@supabase/supabase-js', '@supabase/ssr'], name: 'Supabase', category: 'library' },
    { package: ['next-auth', '@auth/core'], name: 'Auth.js', category: 'library' },
];

interface PackageJson {
    name?: string;
    description?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
}

interface PackageJsonResult {
    name?: string;
    description?: string;
    techStack: TechStackEntry[];
    rules: ParsedRule[];
}

function resolveVersion(
    packages: string[],
    deps: Record<string, string>,
    devDeps: Record<string, string>,
): string | undefined {
    for (const pkg of packages) {
        const version = deps[pkg] ?? devDeps[pkg];
        if (version) {
            return version.replace(/^[\^~>=<]/, '');
        }
    }
    return undefined;
}

export function parsePackageJson(pkg: PackageJson): PackageJsonResult {
    const deps = pkg.dependencies ?? {};
    const devDeps = pkg.devDependencies ?? {};
    const allDeps = { ...devDeps, ...deps };

    const techStack: TechStackEntry[] = [];
    const rules: ParsedRule[] = [];

    for (const rule of DETECTION_RULES) {
        const packages = Array.isArray(rule.package) ? rule.package : [rule.package];
        const found = packages.some((p) => p in allDeps);

        if (!found) {
            continue;
        }

        const version = resolveVersion(packages, deps, devDeps);

        techStack.push({
            name: rule.name,
            ...(version && { version }),
            category: rule.category,
        });

        rules.push({
            text: `Uses ${rule.name}${version ? ` (${version})` : ''} as ${rule.category}`,
            classification: 'decision',
            source: 'package.json',
        });
    }

    return {
        ...(pkg.name && { name: pkg.name }),
        ...(pkg.description && { description: pkg.description }),
        techStack,
        rules,
    };
}
