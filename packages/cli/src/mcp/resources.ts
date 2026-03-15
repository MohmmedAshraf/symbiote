import type { ServerContext } from './context.js';
import { handleGetProjectOverview } from './tools/project-tools.js';
import { handleGetHealth } from './tools/health-tools.js';

export function handleDnaResource(ctx: ServerContext): string {
    const entries = ctx.dnaEngine.getActiveEntries();

    if (entries.length === 0) {
        return 'No developer DNA entries found. DNA is learned from your corrections and instructions to AI tools.';
    }

    const lines = [
        `Developer DNA — ${entries.length} active entries\n`,
    ];

    for (const entry of entries) {
        const fm = entry.frontmatter;
        const statusLabel =
            fm.status === 'approved' ? 'APPROVED' : 'SUGGESTED';
        lines.push(
            `[${statusLabel}] ${fm.category}/${fm.id} (confidence: ${fm.confidence})\n  ${entry.content}\n`
        );
    }

    return lines.join('\n');
}

export function handleProjectOverviewResource(
    ctx: ServerContext
): string {
    const overview = handleGetProjectOverview(ctx);

    const lines = [
        'Project Overview',
        `Nodes: ${overview.totalNodes}`,
        `Edges: ${overview.totalEdges}`,
        `Files: ${overview.totalFiles}`,
        '',
        'Node Types:',
    ];

    for (const [type, count] of Object.entries(
        overview.nodesByType
    )) {
        lines.push(`  ${type}: ${count}`);
    }

    if (overview.constraints.length > 0) {
        lines.push('', 'Active Constraints:');
        for (const c of overview.constraints) {
            lines.push(
                `  - [${c.frontmatter.id}] ${c.content.slice(0, 100)}`
            );
        }
    }

    if (overview.decisions.length > 0) {
        lines.push('', 'Active Decisions:');
        for (const d of overview.decisions) {
            lines.push(
                `  - [${d.frontmatter.id}] ${d.content.slice(0, 100)}`
            );
        }
    }

    return lines.join('\n');
}

export function handleProjectHealthResource(
    ctx: ServerContext
): string {
    const report = handleGetHealth(ctx);

    const lines = [
        `Health Score: ${report.score}/100`,
        '',
        `Orphan Files: ${report.orphanFiles.length}`,
    ];

    for (const f of report.orphanFiles.slice(0, 10)) {
        lines.push(`  - ${f}`);
    }

    lines.push(
        `\nCircular Dependencies: ${report.circularDeps.length}`
    );
    for (const c of report.circularDeps.slice(0, 10)) {
        lines.push(`  - ${c.filePaths.join(' <-> ')}`);
    }

    lines.push(
        `\nConstraint Violations: ${report.constraintViolations.length}`
    );
    for (const v of report.constraintViolations.slice(0, 10)) {
        lines.push(
            `  - [${v.constraintId}] ${v.description.slice(0, 80)}`
        );
    }

    lines.push(`\nDead Code: ${report.deadCode.length}`);
    for (const d of report.deadCode.slice(0, 10)) {
        lines.push(
            `  - ${d.name} (${d.filePath}:${d.lineStart})`
        );
    }

    return lines.join('\n');
}
