import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const BRAIN_DIR = '.brain';
export const SYMBIOTE_HOME = path.join(os.homedir(), '.symbiote');

export interface BrainConfig {
    version: number;
    projectName?: string;
}

export interface GlobalConfig {
    version: number;
}

export function ensureBrainDir(projectRoot: string): string {
    const brainDir = path.join(projectRoot, BRAIN_DIR);
    fs.mkdirSync(brainDir, { recursive: true });

    const gitignorePath = path.join(brainDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, 'symbiote.db\n');
    }

    const configPath = path.join(brainDir, 'config.json');
    if (!fs.existsSync(configPath)) {
        const config: BrainConfig = {
            version: 1,
            projectName: path.basename(projectRoot),
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4) + '\n');
    }

    fs.mkdirSync(path.join(brainDir, 'intent', 'decisions'), {
        recursive: true,
    });
    fs.mkdirSync(path.join(brainDir, 'intent', 'constraints'), {
        recursive: true,
    });

    return brainDir;
}

export function ensureSymbioteHome(): string {
    fs.mkdirSync(SYMBIOTE_HOME, { recursive: true });

    const configPath = path.join(SYMBIOTE_HOME, 'config.json');
    if (!fs.existsSync(configPath)) {
        const config: GlobalConfig = { version: 1 };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4) + '\n');
    }

    fs.mkdirSync(path.join(SYMBIOTE_HOME, 'dna', 'style'), { recursive: true });
    fs.mkdirSync(path.join(SYMBIOTE_HOME, 'dna', 'preferences'), {
        recursive: true,
    });
    fs.mkdirSync(path.join(SYMBIOTE_HOME, 'dna', 'anti-patterns'), {
        recursive: true,
    });
    fs.mkdirSync(path.join(SYMBIOTE_HOME, 'dna', 'decisions'), {
        recursive: true,
    });

    return SYMBIOTE_HOME;
}

export function getBrainDbPath(projectRoot: string): string {
    return path.join(projectRoot, BRAIN_DIR, 'symbiote.db');
}

export const DEFAULT_PORT = 3333;

export function getServerPort(): number {
    const envPort = process.env.SYMBIOTE_PORT;
    if (envPort) {
        const parsed = parseInt(envPort, 10);
        if (!isNaN(parsed)) return parsed;
    }
    return DEFAULT_PORT;
}
