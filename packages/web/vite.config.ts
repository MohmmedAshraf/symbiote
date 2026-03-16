import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import glsl from 'vite-plugin-glsl';
import fs from 'node:fs';
import path from 'node:path';

function getBackendUrl(): string {
    const portFile = path.resolve(__dirname, '../../.brain/port');
    try {
        const port = fs.readFileSync(portFile, 'utf-8').trim();
        if (port) return `http://localhost:${port}`;
    } catch {
        // Port file not found — fall back to default
    }
    return 'http://localhost:3333';
}

export default defineConfig({
    plugins: [react(), tailwindcss(), glsl()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        proxy: {
            '/api': getBackendUrl(),
        },
    },
});
