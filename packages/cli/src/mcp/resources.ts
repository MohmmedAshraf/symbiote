import type { ServerContext } from './context.js';
import { handleGetProjectOverview } from './tools/project-tools.js';

export function handleDnaResource(ctx: ServerContext): string {
    const entries = ctx.dnaEngine.getActiveEntries();

    if (entries.length === 0) {
        return 'No developer DNA entries found. DNA is learned from your corrections and instructions to AI tools.';
    }

    entries.sort((a, b) => b.confidence - a.confidence);
    const top = entries.slice(0, 30);
    const truncated = entries.length > 30;

    const lines = [
        `Developer DNA — showing top ${top.length} of ${entries.length} entries (by confidence)\n`,
    ];

    for (const entry of top) {
        lines.push(`[${entry.category}] ${entry.rule} (${entry.confidence})`);
    }

    if (truncated) {
        lines.push(
            `\n... ${entries.length - 30} more entries. Use get_developer_dna tool with category filter for details.`,
        );
    }

    return lines.join('\n');
}

export async function handleProjectOverviewResource(ctx: ServerContext): Promise<string> {
    const { data: overview } = await handleGetProjectOverview(ctx);

    const lines: string[] = [];

    if (overview.overview) {
        lines.push(overview.overview, '');
    }

    lines.push(
        'Graph Stats',
        `Nodes: ${overview.totalNodes}`,
        `Edges: ${overview.totalEdges}`,
        `Files: ${overview.totalFiles}`,
        '',
        'Node Types:',
    );

    for (const [type, count] of Object.entries(overview.nodesByType)) {
        lines.push(`  ${type}: ${count}`);
    }

    if (overview.constraints.length > 0) {
        lines.push('', 'Active Constraints:');
        for (const c of overview.constraints) {
            lines.push(`  - [${c.frontmatter.id}] ${c.content.slice(0, 100)}`);
        }
    }

    if (overview.decisions.length > 0) {
        lines.push('', 'Active Decisions:');
        for (const d of overview.decisions) {
            lines.push(`  - [${d.frontmatter.id}] ${d.content.slice(0, 100)}`);
        }
    }

    return lines.join('\n');
}

export async function handleProjectHealthResource(ctx: ServerContext): Promise<string> {
    const report = await ctx.health.analyze();

    const lines = [
        `Health Score: ${report.score}/100`,
        '',
        `Constraints: ${report.categories.constraints.score}/100 (${report.constraintViolations.length} violations, weight: ${report.categories.constraints.weight * 100}%)`,
        `Circular Dependencies: ${report.categories.circularDeps.score}/100 (${report.circularDeps.length} cycles, weight: ${report.categories.circularDeps.weight * 100}%)`,
        `Dead Code: ${report.categories.deadCode.score}/100 (${report.deadCode.length} unreferenced, weight: ${report.categories.deadCode.weight * 100}%)`,
        `Coupling: ${report.categories.coupling.score}/100 (${report.couplingHotspots.length} hotspots, weight: ${report.categories.coupling.weight * 100}%)`,
    ];

    if (report.constraintViolations.length > 0) {
        lines.push('', '--- Constraint Violations ---');
        for (const v of report.constraintViolations) {
            lines.push(`  ${v.filePath}:${v.lineStart} — ${v.constraintId}: ${v.matchedText}`);
        }
    }

    if (report.descriptiveConstraints.length > 0) {
        lines.push('', '--- Active Constraints (descriptive) ---');
        for (const c of report.descriptiveConstraints) {
            lines.push(`  [${c.constraintId}] ${c.description.slice(0, 80)}`);
        }
    }

    if (report.circularDeps.length > 0) {
        lines.push('', '--- Circular Dependencies ---');
        for (const cycle of report.circularDeps) {
            lines.push(`  ${cycle.filePaths.join(' → ')} → ${cycle.filePaths[0]}`);
        }
    }

    if (report.couplingHotspots.length > 0) {
        lines.push('', '--- Coupling Hotspots ---');
        for (const h of report.couplingHotspots) {
            lines.push(
                `  ${h.filePath}: ${h.incomingEdges} in, ${h.outgoingEdges} out (${h.totalEdges} total)`,
            );
        }
    }

    return lines.join('\n');
}
