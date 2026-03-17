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
        fs.writeFileSync(gitignorePath, 'symbiote.db\nport\n');
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
const PORT_RANGE_START = 3334;
const PORT_RANGE_END = 9999;

export function getProjectPort(projectRoot: string): number {
    const envPort = process.env.SYMBIOTE_PORT;
    if (envPort) {
        const parsed = parseInt(envPort, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed <= 65535) return parsed;
    }

    const portFile = path.join(projectRoot, BRAIN_DIR, 'port');
    if (fs.existsSync(portFile)) {
        const stored = parseInt(fs.readFileSync(portFile, 'utf-8').trim(), 10);
        if (!isNaN(stored) && stored > 0 && stored <= 65535) return stored;
    }

    return portFromPath(projectRoot);
}

export function writePortFile(projectRoot: string, port: number): void {
    const portFile = path.join(projectRoot, BRAIN_DIR, 'port');
    fs.mkdirSync(path.dirname(portFile), { recursive: true });
    fs.writeFileSync(portFile, String(port) + '\n');
}

export function clearPortFile(projectRoot: string): void {
    const portFile = path.join(projectRoot, BRAIN_DIR, 'port');
    try {
        fs.unlinkSync(portFile);
    } catch {
        // Already gone
    }
}

export function getServerPort(): number {
    return getProjectPort(process.cwd());
}

function portFromPath(projectRoot: string): number {
    let hash = 0;
    for (let i = 0; i < projectRoot.length; i++) {
        hash = ((hash << 5) - hash + projectRoot.charCodeAt(i)) | 0;
    }
    return PORT_RANGE_START + (Math.abs(hash) % (PORT_RANGE_END - PORT_RANGE_START));
}
