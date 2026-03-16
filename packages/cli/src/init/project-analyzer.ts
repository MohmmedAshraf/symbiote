import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parsePackageJson } from './parsers/package-json.js';
import type { ProjectAnalysis, ArchitectureSignal } from './parsers/types.js';

const ARCHITECTURE_PATTERNS: Record<string, string> = {
    app: 'app-router',
    pages: 'pages-router',
    src: 'src-directory',
    components: 'component-library',
    lib: 'lib-utilities',
    utils: 'utility-layer',
    hooks: 'custom-hooks',
    modules: 'modular-architecture',
    services: 'service-layer',
    api: 'api-layer',
    packages: 'monorepo',
    apps: 'monorepo',
    prisma: 'prisma-orm',
    drizzle: 'drizzle-orm',
    supabase: 'supabase',
    test: 'testing',
    tests: 'testing',
    __tests__: 'testing',
    e2e: 'e2e-testing',
    public: 'static-assets',
    static: 'static-assets',
};

const ENTRY_POINT_PATTERNS = [
    'src/index.ts',
    'src/index.tsx',
    'src/main.ts',
    'src/main.tsx',
    'app/layout.tsx',
    'app/layout.ts',
    'app/page.tsx',
    'app/page.ts',
    'pages/index.tsx',
    'pages/index.ts',
    'pages/_app.tsx',
    'pages/_app.ts',
    'index.ts',
    'index.tsx',
    'index.js',
    'index.jsx',
    'main.ts',
    'main.js',
    'server.ts',
    'server.js',
];

function detectArchitecture(projectRoot: string): ArchitectureSignal[] {
    const signals: ArchitectureSignal[] = [];

    let entries: string[];
    try {
        entries = readdirSync(projectRoot, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
    } catch {
        return signals;
    }

    for (const dir of entries) {
        const pattern = ARCHITECTURE_PATTERNS[dir];
        if (pattern) {
            signals.push({ pattern, confidence: 0.8 });
        }
    }

    return signals;
}

function detectEntryPoints(projectRoot: string): string[] {
    const found: string[] = [];

    for (const pattern of ENTRY_POINT_PATTERNS) {
        try {
            readFileSync(join(projectRoot, pattern));
            found.push(pattern);
        } catch {
            // not found
        }
    }

    return found;
}

export function analyzeProject(projectRoot: string): ProjectAnalysis {
    const architecture = detectArchitecture(projectRoot);
    const entryPoints = detectEntryPoints(projectRoot);

    let packageJson: Record<string, unknown> | null = null;
    try {
        const raw = readFileSync(join(projectRoot, 'package.json'), 'utf-8');
        packageJson = JSON.parse(raw);
    } catch {
        // no package.json
    }

    const { techStack, description } = packageJson
        ? parsePackageJson(packageJson as Parameters<typeof parsePackageJson>[0])
        : { techStack: [], description: undefined };

    return {
        techStack,
        architecture,
        conventions: [],
        entryPoints,
        ...(description && { description }),
    };
}
