import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const BRAIN_DIR = '.brain';
export const SYNAPSE_HOME = path.join(os.homedir(), '.synapse');

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
        fs.writeFileSync(gitignorePath, 'synapse.db\n');
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

export function ensureSynapseHome(): string {
    fs.mkdirSync(SYNAPSE_HOME, { recursive: true });

    const configPath = path.join(SYNAPSE_HOME, 'config.json');
    if (!fs.existsSync(configPath)) {
        const config: GlobalConfig = { version: 1 };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4) + '\n');
    }

    fs.mkdirSync(path.join(SYNAPSE_HOME, 'dna', 'style'), { recursive: true });
    fs.mkdirSync(path.join(SYNAPSE_HOME, 'dna', 'preferences'), {
        recursive: true,
    });
    fs.mkdirSync(path.join(SYNAPSE_HOME, 'dna', 'anti-patterns'), {
        recursive: true,
    });
    fs.mkdirSync(path.join(SYNAPSE_HOME, 'dna', 'decisions'), {
        recursive: true,
    });

    return SYNAPSE_HOME;
}

export function getBrainDbPath(projectRoot: string): string {
    return path.join(projectRoot, BRAIN_DIR, 'synapse.db');
}
