import { defineConfig } from 'vitest/config';
import path from 'node:path';

const src = path.resolve(import.meta.dirname, 'src');

export default defineConfig({
    resolve: {
        alias: {
            '#storage': path.join(src, 'storage'),
            '#core': path.join(src, 'core'),
            '#cortex': path.join(src, 'cortex'),
            '#dna': path.join(src, 'dna'),
            '#brain': path.join(src, 'brain'),
            '#events': path.join(src, 'events'),
            '#mcp': path.join(src, 'mcp'),
            '#utils': path.join(src, 'utils'),
            '#commands': path.join(src, 'commands'),
            '#hooks': path.join(src, 'hooks'),
            '#init': path.join(src, 'init'),
        },
    },
    test: {
        globals: true,
        testTimeout: 30000,
        include: ['test/**/*.test.ts'],
        exclude: ['dist/**', 'node_modules/**'],
    },
});
