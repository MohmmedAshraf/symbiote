import path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { ensureSymbioteHome } from '#utils/config.js';
import { DnaStorage } from '#dna/storage.js';
import { DnaEngine } from '#dna/engine.js';

export async function cmdDna(
    subcommand: string | undefined,
    args: string[],
    flags: Record<string, string | boolean>,
): Promise<void> {
    const symbioteHome = ensureSymbioteHome();
    const dnaDir = path.join(symbioteHome, 'dna');
    const storage = new DnaStorage(dnaDir);
    storage.ensureDirectories();

    if (!subcommand || subcommand === 'dna') {
        const all = storage.listEntries();
        const approved = all.filter((e) => e.frontmatter.status === 'approved');
        const suggested = all.filter((e) => e.frontmatter.status === 'suggested');
        const rejected = all.filter((e) => e.frontmatter.status === 'rejected');

        p.intro(pc.bold('Developer DNA'));
        p.log.info(
            `${pc.dim('Total:')}     ${all.length}\n` +
                `${pc.dim('Approved:')}  ${approved.length}\n` +
                `${pc.dim('Suggested:')} ${suggested.length}\n` +
                `${pc.dim('Rejected:')}  ${rejected.length}`,
        );

        if (suggested.length > 0) {
            p.log.warn('Pending review:');
            for (const entry of suggested) {
                console.log(
                    `  ${pc.yellow('[?]')} ${entry.frontmatter.id} ${pc.dim(`(confidence: ${entry.frontmatter.confidence})`)}`,
                );
            }
            console.log();
            console.log(
                pc.dim(
                    "  Run 'symbiote dna approve <id>' or 'symbiote dna reject <id>' to review.",
                ),
            );
        }

        p.outro('');
        return;
    }

    if (subcommand === 'list') {
        const entries = storage.listEntries({
            status: (typeof flags.status === 'string' ? flags.status : undefined) as
                | 'suggested'
                | 'approved'
                | 'rejected'
                | undefined,
            category: (typeof flags.category === 'string' ? flags.category : undefined) as
                | 'style'
                | 'preferences'
                | 'anti-patterns'
                | 'decisions'
                | undefined,
        });

        if (entries.length === 0) {
            p.log.info('No DNA entries found.');
            return;
        }

        console.log(`\n${pc.bold('Developer DNA')} ${pc.dim(`— ${entries.length} entries`)}\n`);
        console.log(pc.dim('\u2500'.repeat(70)));

        for (const entry of entries) {
            const fm = entry.frontmatter;
            const statusIcon =
                fm.status === 'approved'
                    ? pc.green('[+]')
                    : fm.status === 'rejected'
                      ? pc.red('[-]')
                      : pc.yellow('[?]');

            console.log(
                `${statusIcon} ${pc.bold(fm.id)}  ${pc.dim(`(${fm.category}, confidence: ${fm.confidence}, occurrences: ${fm.occurrences})`)}`,
            );
            console.log(
                `    ${entry.content.slice(0, 100)}${entry.content.length > 100 ? '...' : ''}`,
            );
            console.log(pc.dim('\u2500'.repeat(70)));
        }
        return;
    }

    if (subcommand === 'show') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna show <id>');
            process.exit(1);
        }

        const entry = storage.readEntry(id);
        if (!entry) {
            p.log.error(`Entry not found: ${id}`);
            process.exit(1);
        }

        const fm = entry.frontmatter;
        console.log();
        console.log(`${pc.dim('ID:')}          ${pc.bold(fm.id)}`);
        console.log(`${pc.dim('Category:')}    ${fm.category}`);
        console.log(`${pc.dim('Status:')}      ${fm.status}`);
        console.log(`${pc.dim('Confidence:')}  ${fm.confidence}`);
        console.log(`${pc.dim('Source:')}      ${fm.source}`);
        console.log(`${pc.dim('First seen:')}  ${fm.firstSeen}`);
        console.log(`${pc.dim('Last seen:')}   ${fm.lastSeen}`);
        console.log(`${pc.dim('Occurrences:')} ${fm.occurrences}`);
        console.log(`${pc.dim('Sessions:')}    ${fm.sessionIds.length}`);
        console.log(`\n${entry.content}\n`);
        return;
    }

    if (subcommand === 'approve') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna approve <id>');
            process.exit(1);
        }

        const engine = new DnaEngine(storage);
        const entry = engine.approveEntry(id);
        if (entry) {
            p.log.success(`Approved: ${entry.frontmatter.id}`);
        } else {
            p.log.error(`Entry not found: ${id}`);
        }
        return;
    }

    if (subcommand === 'reject') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna reject <id>');
            process.exit(1);
        }

        const engine = new DnaEngine(storage);
        const entry = engine.rejectEntry(id);
        if (entry) {
            p.log.success(`Rejected: ${entry.frontmatter.id}`);
        } else {
            p.log.error(`Entry not found: ${id}`);
        }
        return;
    }

    if (subcommand === 'delete') {
        const id = args[0];
        if (!id) {
            p.log.error('Usage: symbiote dna delete <id>');
            process.exit(1);
        }

        storage.deleteEntry(id);
        p.log.success(`Deleted: ${id}`);
        return;
    }

    p.log.error(`Unknown DNA subcommand: ${subcommand}`);
    console.log(pc.dim('  Available: list, show, approve, reject, delete'));
    process.exit(1);
}
