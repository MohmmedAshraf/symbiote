import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, 'src'),
        },
    },
    test: {
        globals: true,
        include: ['test/**/*.test.ts'],
        exclude: ['dist/**', 'node_modules/**'],
    },
});
