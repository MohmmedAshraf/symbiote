#!/usr/bin/env node

import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
    cmdInit,
    cmdScan,
    cmdServe,
    cmdMcp,
    cmdDna,
    cmdImpact,
    cmdHookPre,
    cmdHookPost,
    cmdHooksInstall,
    cmdHooksUninstall,
    cmdUnbond,
} from '../src/commands/index.js';

const RESET = '\x1b[0m';

const LOGO_LINES = [
    '███████╗██╗   ██╗███╗   ███╗██████╗ ██╗ ██████╗ ████████╗███████╗',
    '██╔════╝╚██╗ ██╔╝████╗ ████║██╔══██╗██║██╔═══██╗╚══██╔══╝██╔════╝',
    '███████╗ ╚████╔╝ ██╔████╔██║██████╔╝██║██║   ██║   ██║   █████╗  ',
    '╚════██║  ╚██╔╝  ██║╚██╔╝██║██╔══██╗██║██║   ██║   ██║   ██╔══╝  ',
    '███████║   ██║   ██║ ╚═╝ ██║██████╔╝██║╚██████╔╝   ██║   ███████╗',
    '╚══════╝   ╚═╝   ╚═╝     ╚═╝╚═════╝ ╚═╝ ╚═════╝    ╚═╝   ╚══════╝',
];

const GRAYS = [
    '\x1b[38;5;250m',
    '\x1b[38;5;248m',
    '\x1b[38;5;245m',
    '\x1b[38;5;243m',
    '\x1b[38;5;240m',
    '\x1b[38;5;238m',
];

function showLogo(): void {
    console.log();
    LOGO_LINES.forEach((line, i) => {
        console.log(`${GRAYS[i]}${line}${RESET}`);
    });
}

function showHelp(): void {
    showLogo();
    console.log();
    console.log(pc.dim('  Your codebase gets a brain. Your AI never forgets who you are.'));
    console.log();
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote init')}          Initialize for the current project`,
    );
    console.log(`  ${pc.bold('$')} ${pc.cyan('symbiote scan')}          Rescan codebase`);
    console.log(`  ${pc.bold('$')} ${pc.cyan('symbiote serve')}         Start MCP server + web UI`);
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote mcp')}           MCP server only (for editors)`,
    );
    console.log(`  ${pc.bold('$')} ${pc.cyan('symbiote dna')}           View your developer DNA`);
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote impact')}        Analyze impact of working changes`,
    );
    console.log(`  ${pc.bold('$')} ${pc.cyan('symbiote unbond')}        Detach from all AI agents`);
    console.log();
    console.log(pc.dim('  Claude Code Hooks:'));
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote hooks install')}  Register hooks with Claude Code`,
    );
    console.log(
        `  ${pc.bold('$')} ${pc.cyan('symbiote hooks uninstall')} Remove hooks from Claude Code`,
    );
    console.log();
    console.log(pc.dim('  Connect to Claude Code:'));
    console.log(`    ${pc.dim('claude mcp add symbiote -- npx symbiote-cli mcp')}`);
    console.log();
}

function parseArgs(argv: string[]): {
    command: string;
    args: string[];
    flags: Record<string, string | boolean>;
} {
    const raw = argv.slice(2);
    const command = raw.find((a) => !a.startsWith('-')) ?? '';
    const args: string[] = [];
    const flags: Record<string, string | boolean> = {};

    let skipNext = false;
    for (let i = 0; i < raw.length; i++) {
        if (skipNext) {
            skipNext = false;
            continue;
        }
        const arg = raw[i];
        if (arg === command && args.length === 0 && !arg.startsWith('-')) {
            continue;
        }
        if (arg.startsWith('--')) {
            const eqIdx = arg.indexOf('=');
            if (eqIdx !== -1) {
                flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
            } else if (i + 1 < raw.length && !raw[i + 1].startsWith('-')) {
                flags[arg.slice(2)] = raw[i + 1];
                skipNext = true;
            } else {
                flags[arg.slice(2)] = true;
            }
        } else if (arg.startsWith('-') && arg.length === 2) {
            const short = arg[1];
            const longMap: Record<string, string> = {
                f: 'force',
                e: 'embeddings',
                p: 'port',
                s: 'status',
                c: 'category',
                h: 'help',
                v: 'version',
            };
            const long = longMap[short] ?? short;
            if (i + 1 < raw.length && !raw[i + 1].startsWith('-')) {
                flags[long] = raw[i + 1];
                skipNext = true;
            } else {
                flags[long] = true;
            }
        } else {
            args.push(arg);
        }
    }

    return { command, args, flags };
}

function forceExit(code: number): void {
    try {
        process.kill(process.pid, code === 0 ? 'SIGTERM' : 'SIGTERM');
    } catch {
        process.exit(code);
    }
}

async function main(): Promise<void> {
    const { command, args, flags } = parseArgs(process.argv);

    if (flags.help) {
        showHelp();
        process.exit(0);
    }

    if (flags.version) {
        console.log('0.1.0');
        process.exit(0);
    }

    switch (command) {
        case '':
            showHelp();
            break;
        case 'init':
            await cmdInit();
            break;
        case 'scan':
            await cmdScan(flags);
            break;
        case 'serve':
            await cmdServe(flags);
            break;
        case 'mcp':
            await cmdMcp();
            break;
        case 'impact':
            await cmdImpact();
            break;
        case 'hook': {
            const subcommand = args[0];
            if (subcommand === 'pre') {
                await cmdHookPre();
            } else if (subcommand === 'post') {
                await cmdHookPost();
            } else {
                p.log.error(`Unknown hook subcommand: ${subcommand}`);
                console.log(pc.dim('  Available: pre, post'));
                process.exit(1);
            }
            break;
        }
        case 'hooks': {
            const subcommand = args[0];
            if (subcommand === 'install') {
                await cmdHooksInstall();
            } else if (subcommand === 'uninstall') {
                await cmdHooksUninstall();
            } else {
                p.log.error(`Unknown hooks subcommand: ${subcommand}`);
                console.log(pc.dim('  Available: install, uninstall'));
                process.exit(1);
            }
            break;
        }
        case 'dna': {
            const subcommand = args[0];
            const subArgs = args.slice(1);
            await cmdDna(subcommand, subArgs, flags);
            break;
        }
        case 'unbond': {
            const targetId = args[0];
            await cmdUnbond(targetId);
            break;
        }
        default:
            p.log.error(`Unknown command: ${command}`);
            showHelp();
            process.exit(1);
    }
}

const LONG_RUNNING_COMMANDS = new Set(['serve', 'mcp', 'hook']);

main()
    .then(() => {
        const { command } = parseArgs(process.argv);
        if (!LONG_RUNNING_COMMANDS.has(command)) {
            forceExit(0);
        }
    })
    .catch((err) => {
        p.log.error(err instanceof Error ? err.message : String(err));
        forceExit(1);
    });
