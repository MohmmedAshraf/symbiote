import * as p from '@clack/prompts';
import pc from 'picocolors';
import { Repository } from '../storage/repository.js';
import { Scanner } from '../core/scanner.js';
import { ensureBrainDir, ensureSymbioteHome, getBrainDbPath } from '../utils/config.js';
import { createDatabaseWithRetry } from './shared.js';

export async function cmdInit(): Promise<void> {
    const { SmartInit } = await import('../init/index.js');

    const projectRoot = process.cwd();

    p.intro(pc.bold('Symbiote') + pc.dim(' — Initializing project brain'));

    const symbioteHome = ensureSymbioteHome();
    const brainDir = ensureBrainDir(projectRoot);

    const dbPath = getBrainDbPath(projectRoot);
    const db = await createDatabaseWithRetry(dbPath);
    const repo = new Repository(db);
    const scanner = new Scanner(repo, db);

    const s1 = p.spinner();
    s1.start('Scanning codebase...');
    const scanResult = await scanner.scan(projectRoot, { embeddings: true });
    if (scanResult.filesScanned === 0 && scanResult.filesSkipped > 0) {
        s1.stop(`Up to date ${pc.dim(`(${scanResult.filesSkipped} files, no changes)`)}`);
    } else {
        s1.stop(
            `${scanResult.filesScanned} files` +
                pc.dim(` · ${scanResult.nodesCreated} nodes · ${scanResult.edgesCreated} edges`),
        );
    }

    const s2 = p.spinner();
    s2.start('Analyzing project...');
    const init = new SmartInit({
        projectRoot,
        symbioteHome,
        brainDir,
        scanResult,
    });
    const result = await init.run();
    s2.stop('Project analyzed');

    await db.close();

    const lines: string[] = [];
    if (result.rulesImported > 0) {
        lines.push(`${pc.dim('Rules imported:')}   ${result.rulesImported}`);
    }
    if (result.techStack.length > 0) {
        lines.push(
            `${pc.dim('Tech stack:')}      ${result.techStack.map((t) => t.name).join(', ')}`,
        );
    }
    if (result.architectureSignals.length > 0) {
        lines.push(
            `${pc.dim('Architecture:')}    ${result.architectureSignals
                .slice(0, 3)
                .map((s) => s.pattern)
                .join(', ')}`,
        );
    }
    if (result.intentEntriesCreated > 0) {
        lines.push(
            `${pc.dim('Intent entries:')}  ${result.intentEntriesCreated} constraints/decisions`,
        );
    }
    if (result.dnaEntriesImported > 0 || result.dnaEntriesLoaded > 0) {
        lines.push(
            `${pc.dim('DNA entries:')}     ${result.dnaEntriesLoaded} loaded, ${result.dnaEntriesImported} imported`,
        );
    }

    if (lines.length > 0) {
        p.log.info(lines.join('\n'));
    }

    if (scanResult.errors.length > 0) {
        p.log.warn(`${scanResult.errors.length} files had parse errors.`);
    }

    const { detectInstalledAgents, isBonded, connectWithHooks, ensureClaudeHooks } =
        await import('../init/agent-connector.js');

    const agents = detectInstalledAgents();
    const installed = agents.filter((a) => a.installed);

    if (installed.length === 0) {
        p.log.info(
            pc.dim(
                'No AI agents detected. Install Claude Code, Cursor, or another supported host,\n' +
                    'then run `symbiote init` again.',
            ),
        );
    } else {
        const alreadyBonded = installed.filter((a) => isBonded(a));
        const unbonded = installed.filter((a) => !isBonded(a));

        if (alreadyBonded.length > 0) {
            for (const agent of alreadyBonded) {
                if (agent.id === 'claude-code') {
                    ensureClaudeHooks();
                }
                p.log.info(`${pc.green('✓')} ${agent.name} ${pc.dim('[already bonded]')}`);
            }
        }

        if (unbonded.length > 0) {
            const options = unbonded.map((a) => ({
                value: a.id,
                label: a.name,
                hint: a.id === 'claude-code' ? 'MCP server + hooks' : 'MCP server',
            }));

            const selected = await p.multiselect({
                message: 'Bond with detected hosts?',
                options,
                initialValues: unbonded.map((a) => a.id),
                required: false,
            });

            if (p.isCancel(selected)) {
                p.log.info(pc.dim('Skipped bonding.'));
            } else if (Array.isArray(selected) && selected.length > 0) {
                const toBond = unbonded.filter((a) => selected.includes(a.id));
                for (const agent of toBond) {
                    const s3 = p.spinner();
                    s3.start(`Bonding with ${agent.name}...`);
                    const result = connectWithHooks(agent);
                    if (result.mcp.success && result.hooks.success) {
                        const detail =
                            agent.id === 'claude-code'
                                ? 'MCP server added, hooks installed'
                                : 'MCP config written';
                        s3.stop(`${agent.name} — ${detail}`);
                    } else if (result.mcp.success) {
                        s3.stop(`${agent.name} — MCP server added`);
                        p.log.warn(`Hooks failed — run \`symbiote hooks install\` manually`);
                    } else {
                        s3.stop(`${agent.name} — failed`);
                        p.log.error(result.mcp.message);
                    }
                }
            }
        }
    }

    p.outro('Your project has a brain.');
}
