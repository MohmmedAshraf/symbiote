import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { ensureSymbioteHome } from '#utils/config.js';
import { ProfileStorage } from '#dna/profile.js';
import { DnaEngine } from '#dna/engine.js';
import { exportProfile, importProfile, importFromUrl } from '#dna/export.js';
import type { DnaEntry } from '#dna/schema.js';

function statusIcon(status: string): string {
    if (status === 'approved') return pc.green('[+]');
    if (status === 'rejected') return pc.red('[-]');
    return pc.yellow('[?]');
}

function categorySummary(entries: DnaEntry[]): string {
    const counts = new Map<string, number>();
    for (const e of entries) {
        counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cat, n]) => `${cat} (${n})`)
        .join(', ');
}

async function cmdDnaShow(storage: ProfileStorage): Promise<void> {
    const name = storage.getActiveProfileName();
    const profile = storage.readActiveProfile();
    const entries = profile.entries;
    const approved = entries.filter((e) => e.status === 'approved');
    const suggested = entries.filter((e) => e.status === 'suggested');
    const rejected = entries.filter((e) => e.status === 'rejected');

    p.intro(pc.bold(`Developer DNA ${pc.dim(`(${name})`)}`));
    p.log.info(
        `${pc.dim('Total:')}     ${entries.length}\n` +
            `${pc.dim('Approved:')}  ${approved.length}\n` +
            `${pc.dim('Suggested:')} ${suggested.length}\n` +
            `${pc.dim('Rejected:')}  ${rejected.length}`,
    );

    if (entries.length > 0) {
        p.log.info(`${pc.dim('Categories:')} ${categorySummary(entries)}`);
    }

    if (suggested.length > 0) {
        p.log.warn('Pending review:');
        for (const entry of suggested) {
            console.log(
                `  ${pc.yellow('[?]')} ${entry.id} ` +
                    pc.dim(`(confidence: ${entry.confidence})`),
            );
        }
        console.log();
        console.log(
            pc.dim(
                "  Run 'symbiote dna approve <id>' or " +
                    "'symbiote dna reject <id>' to review.",
            ),
        );
    }

    p.outro('');
}

function cmdDnaList(storage: ProfileStorage): void {
    const profiles = storage.listProfiles();
    const active = storage.getActiveProfileName();

    if (profiles.length === 0) {
        p.log.info('No profiles found.');
        return;
    }

    console.log(`\n${pc.bold('DNA Profiles')}\n`);

    for (const name of profiles) {
        const profile = storage.readProfile(name);
        const count = profile?.entries.length ?? 0;
        const marker = name === active ? pc.green(' *') : '  ';
        console.log(
            `${marker} ${pc.bold(name)} ${pc.dim(`(${count} entries)`)}`,
        );
    }
    console.log();
}

function cmdDnaSwitch(storage: ProfileStorage, name: string): void {
    try {
        storage.switchProfile(name);
        p.log.success(`Switched to profile: ${pc.bold(name)}`);
    } catch {
        p.log.error(`Profile "${name}" does not exist.`);
        const profiles = storage.listProfiles();
        if (profiles.length > 0) {
            console.log(
                pc.dim(`  Available: ${profiles.join(', ')}`),
            );
        }
        process.exit(1);
    }
}

function cmdDnaExport(
    storage: ProfileStorage,
    outputPath: string | undefined,
): void {
    const profile = exportProfile(storage);
    const handle = profile.profile.handle || 'profile';
    const filename = outputPath ?? `${handle}.dna.json`;
    const resolved = path.resolve(filename);

    fs.writeFileSync(resolved, JSON.stringify(profile, null, 4) + '\n');
    p.log.success(
        `Exported ${profile.entries.length} entries to ${pc.bold(resolved)}`,
    );
}

async function cmdDnaImport(
    storage: ProfileStorage,
    target: string,
): Promise<void> {
    try {
        let result: { name: string; entryCount: number };

        if (target.startsWith('http://') || target.startsWith('https://')) {
            p.log.info(`Fetching profile from ${pc.dim(target)}...`);
            result = await importFromUrl(storage, target);
        } else {
            const resolved = path.resolve(target);
            if (!fs.existsSync(resolved)) {
                p.log.error(`File not found: ${resolved}`);
                process.exit(1);
            }
            const raw = fs.readFileSync(resolved, 'utf-8');
            result = importProfile(storage, raw);
        }

        p.log.success(
            `Imported profile ${pc.bold(result.name)} ` +
                `with ${result.entryCount} entries`,
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        p.log.error(`Import failed: ${msg}`);
        process.exit(1);
    }
}

function cmdDnaDiff(storage: ProfileStorage, otherName: string): void {
    const activeName = storage.getActiveProfileName();
    const activeProfile = storage.readActiveProfile();
    const otherProfile = storage.readProfile(otherName);

    if (!otherProfile) {
        p.log.error(`Profile "${otherName}" not found.`);
        const profiles = storage.listProfiles();
        if (profiles.length > 0) {
            console.log(
                pc.dim(`  Available: ${profiles.join(', ')}`),
            );
        }
        process.exit(1);
    }

    const activeMap = new Map(activeProfile.entries.map((e) => [e.id, e]));
    const otherMap = new Map(otherProfile.entries.map((e) => [e.id, e]));

    const onlyActive: DnaEntry[] = [];
    const onlyOther: DnaEntry[] = [];
    const diverged: Array<{ id: string; activeRule: string; otherRule: string }> = [];

    for (const [id, entry] of activeMap) {
        const other = otherMap.get(id);
        if (!other) {
            onlyActive.push(entry);
        } else if (entry.rule !== other.rule) {
            diverged.push({ id, activeRule: entry.rule, otherRule: other.rule });
        }
    }

    for (const [id, entry] of otherMap) {
        if (!activeMap.has(id)) {
            onlyOther.push(entry);
        }
    }

    console.log(
        `\n${pc.bold('DNA Diff:')} ` +
            `${pc.green(activeName)} vs ${pc.cyan(otherName)}\n`,
    );

    if (onlyActive.length === 0 && onlyOther.length === 0 && diverged.length === 0) {
        p.log.info('Profiles are identical.');
        return;
    }

    if (onlyActive.length > 0) {
        console.log(pc.green(`  Only in ${activeName} (${onlyActive.length}):`));
        for (const e of onlyActive) {
            console.log(`    ${pc.green('+')} ${e.id}`);
            console.log(`      ${pc.dim(truncate(e.rule, 90))}`);
        }
        console.log();
    }

    if (onlyOther.length > 0) {
        console.log(pc.cyan(`  Only in ${otherName} (${onlyOther.length}):`));
        for (const e of onlyOther) {
            console.log(`    ${pc.cyan('+')} ${e.id}`);
            console.log(`      ${pc.dim(truncate(e.rule, 90))}`);
        }
        console.log();
    }

    if (diverged.length > 0) {
        console.log(pc.yellow(`  Different rules (${diverged.length}):`));
        for (const d of diverged) {
            console.log(`    ${pc.bold(d.id)}`);
            console.log(`      ${pc.green(activeName)}: ${pc.dim(truncate(d.activeRule, 80))}`);
            console.log(`      ${pc.cyan(otherName)}: ${pc.dim(truncate(d.otherRule, 80))}`);
        }
        console.log();
    }
}

function cmdDnaEntryList(
    storage: ProfileStorage,
    flags: Record<string, string | boolean>,
): void {
    const profile = storage.readActiveProfile();
    let entries = profile.entries;

    if (typeof flags.status === 'string') {
        entries = entries.filter((e) => e.status === flags.status);
    }
    if (typeof flags.category === 'string') {
        entries = entries.filter((e) => e.category === flags.category);
    }

    if (entries.length === 0) {
        p.log.info('No DNA entries found.');
        return;
    }

    console.log(
        `\n${pc.bold('Developer DNA')} ${pc.dim(`\u2014 ${entries.length} entries`)}\n`,
    );
    console.log(pc.dim('\u2500'.repeat(70)));

    for (const entry of entries) {
        console.log(
            `${statusIcon(entry.status)} ${pc.bold(entry.id)}  ` +
                pc.dim(
                    `(${entry.category}, confidence: ${entry.confidence}, ` +
                        `occurrences: ${entry.evidence.occurrences})`,
                ),
        );
        console.log(`    ${truncate(entry.rule, 100)}`);
        console.log(pc.dim('\u2500'.repeat(70)));
    }
}

function cmdDnaEntryShow(storage: ProfileStorage, id: string): void {
    const entry = storage.readEntry(id);
    if (!entry) {
        p.log.error(`Entry not found: ${id}`);
        process.exit(1);
    }

    console.log();
    console.log(`${pc.dim('ID:')}          ${pc.bold(entry.id)}`);
    console.log(`${pc.dim('Rule:')}        ${entry.rule}`);
    console.log(`${pc.dim('Reason:')}      ${entry.reason || pc.dim('(none)')}`);
    console.log(`${pc.dim('Category:')}    ${entry.category}`);
    console.log(`${pc.dim('Status:')}      ${entry.status}`);
    console.log(`${pc.dim('Confidence:')}  ${entry.confidence}`);
    console.log(`${pc.dim('Source:')}      ${entry.source}`);
    console.log(`${pc.dim('Applies to:')} ${entry.applies_to.join(', ') || pc.dim('(all)')}`);
    console.log(`${pc.dim('First seen:')}  ${entry.evidence.first_seen}`);
    console.log(`${pc.dim('Last seen:')}   ${entry.evidence.last_seen}`);
    console.log(`${pc.dim('Occurrences:')} ${entry.evidence.occurrences}`);
    console.log(`${pc.dim('Sessions:')}    ${entry.evidence.sessions}`);
    console.log();
}

function cmdDnaApprove(storage: ProfileStorage, id: string): void {
    const engine = new DnaEngine(storage);
    const entry = engine.approveEntry(id);
    if (entry) {
        p.log.success(`Approved: ${entry.id}`);
    } else {
        p.log.error(`Entry not found: ${id}`);
    }
}

function cmdDnaReject(storage: ProfileStorage, id: string): void {
    const engine = new DnaEngine(storage);
    const entry = engine.rejectEntry(id);
    if (entry) {
        p.log.success(`Rejected: ${entry.id}`);
    } else {
        p.log.error(`Entry not found: ${id}`);
    }
}

function cmdDnaDelete(storage: ProfileStorage, id: string): void {
    storage.deleteEntry(id);
    p.log.success(`Deleted: ${id}`);
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + '...';
}

export async function cmdDna(
    subcommand: string | undefined,
    args: string[],
    flags: Record<string, string | boolean>,
): Promise<void> {
    const symbioteHome = ensureSymbioteHome();
    const storage = new ProfileStorage(symbioteHome);

    if (!subcommand || subcommand === 'dna') {
        await cmdDnaShow(storage);
        return;
    }

    if (subcommand === 'list') {
        cmdDnaList(storage);
        return;
    }

    if (subcommand === 'switch') {
        const name = args[0];
        if (!name) {
            p.log.error('Usage: symbiote dna switch <name>');
            process.exit(1);
        }
        cmdDnaSwitch(storage, name);
        return;
    }

    if (subcommand === 'export') {
        const outputPath = typeof flags.output === 'string'
            ? flags.output
            : undefined;
        cmdDnaExport(storage, outputPath);
        return;
    }

    if (subcommand === 'import') {
        const target = args[0];
        if (!target) {
            p.log.error('Usage: symbiote dna import <file|url>');
            process.exit(1);
        }
        await cmdDnaImport(storage, target);
        return;
    }

    if (subcommand === 'diff') {
        const name = args[0];
        if (!name) {
            p.log.error('Usage: symbiote dna diff <name>');
            process.exit(1);
        }
        cmdDnaDiff(storage, name);
        return;
    }

    if (subcommand === 'entries') {
        cmdDnaEntryList(storage, flags);
        return;
    }

    if (subcommand === 'show') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna show <id>');
            process.exit(1);
        }
        cmdDnaEntryShow(storage, id);
        return;
    }

    if (subcommand === 'approve') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna approve <id>');
            process.exit(1);
        }
        cmdDnaApprove(storage, id);
        return;
    }

    if (subcommand === 'reject') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna reject <id>');
            process.exit(1);
        }
        cmdDnaReject(storage, id);
        return;
    }

    if (subcommand === 'delete') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna delete <id>');
            process.exit(1);
        }
        cmdDnaDelete(storage, id);
        return;
    }

    p.log.error(`Unknown DNA subcommand: ${subcommand}`);
    console.log(
        pc.dim(
            '  Available: list, switch, export, import, diff, ' +
                'entries, show, approve, reject, delete',
        ),
    );
    process.exit(1);
}
