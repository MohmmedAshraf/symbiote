import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from './context.js';
import type { EventBus } from '../events/bus.js';
import type { SymbioteEvent } from '../events/types.js';
import { EVENT_TYPES } from '../events/types.js';

export async function handleApiRequest(
    ctx: ServerContext,
    pathname: string,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    if (pathname === '/api/graph' && req.method === 'GET') {
        return await handleGetGraph(ctx, res);
    }

    if (pathname.startsWith('/api/graph/nodes/') && req.method === 'GET') {
        const nodeId = decodeURIComponent(pathname.slice('/api/graph/nodes/'.length));
        return await handleGetNodeContext(ctx, nodeId, res);
    }

    if (pathname === '/api/health' && req.method === 'GET') {
        return await handleGetHealthApi(ctx, res);
    }

    if (pathname === '/api/dna' && req.method === 'GET') {
        return handleListDna(ctx, res);
    }

    if (pathname.startsWith('/api/dna/') && req.method === 'PATCH') {
        const entryId = decodeURIComponent(pathname.slice('/api/dna/'.length));
        return handleUpdateDna(ctx, entryId, req, res);
    }

    return false;
}

function json(res: ServerResponse, data: unknown, status = 200): boolean {
    res.writeHead(status, {
        'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(data));
    return true;
}

async function handleGetGraph(ctx: ServerContext, res: ServerResponse): Promise<boolean> {
    try {
        const nodes = await ctx.repo.getAllNodes();
        const nodeIds = new Set(nodes.map((n) => n.id));
        const edges = (await ctx.repo.getAllEdges()).filter(
            (e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId),
        );
        return json(res, { nodes, edges });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json(res, { error: message, nodes: [], edges: [] }, 500);
    }
}

async function handleGetNodeContext(
    ctx: ServerContext,
    nodeId: string,
    res: ServerResponse,
): Promise<boolean> {
    const node = await ctx.repo.getNodeById(nodeId);
    if (!node) {
        return json(res, { error: 'Node not found' }, 404);
    }

    const dependencies = await ctx.graph.getDependencies(nodeId);
    const dependents = await ctx.graph.getDependents(nodeId);
    const constraints = ctx.intent
        .listEntries('constraint')
        .filter(
            (c) =>
                c.frontmatter.scope === 'global' || node.filePath.startsWith(c.frontmatter.scope),
        );
    const decisions = ctx.intent
        .listEntries('decision')
        .filter(
            (d) =>
                d.frontmatter.scope === 'global' || node.filePath.startsWith(d.frontmatter.scope),
        );

    return json(res, {
        node,
        dependencies,
        dependents,
        constraints,
        decisions,
    });
}

async function handleGetHealthApi(ctx: ServerContext, res: ServerResponse): Promise<boolean> {
    const report = await ctx.health.analyze();

    const toIssues = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        items: any[],
        category: string,
        severity: 'error' | 'warning' | 'info',
    ) =>
        items.map((item) => ({
            severity,
            message: item.message ?? item.chain?.join(' → ') ?? item.name ?? String(item),
            filePath: item.filePath ?? item.file ?? '',
            line: item.line ?? item.lineStart,
            category,
        }));

    return json(res, {
        score: report.score,
        categories: {
            constraintViolations: {
                score: report.categories.constraints.score,
                weight: report.categories.constraints.weight,
                issues: toIssues(report.constraintViolations ?? [], 'constraint', 'error'),
            },
            circularDeps: {
                score: report.categories.circularDeps.score,
                weight: report.categories.circularDeps.weight,
                issues: toIssues(report.circularDeps ?? [], 'circular-dep', 'warning'),
            },
            deadCode: {
                score: report.categories.deadCode.score,
                weight: report.categories.deadCode.weight,
                issues: toIssues(report.deadCode ?? [], 'dead-code', 'info'),
            },
            coupling: {
                score: report.categories.coupling.score,
                weight: report.categories.coupling.weight,
                issues: toIssues(report.couplingHotspots ?? [], 'coupling', 'warning'),
            },
        },
    });
}

function handleListDna(ctx: ServerContext, res: ServerResponse): boolean {
    const entries = ctx.dnaEngine.getActiveEntries().map((e) => ({
        id: e.frontmatter.id,
        category: e.frontmatter.category,
        confidence: e.frontmatter.confidence,
        source: e.frontmatter.source,
        status: e.frontmatter.status,
        firstSeen: e.frontmatter.firstSeen,
        lastSeen: e.frontmatter.lastSeen,
        occurrences: e.frontmatter.occurrences,
        content: e.content,
    }));
    return json(res, entries);
}

function handleUpdateDna(
    ctx: ServerContext,
    entryId: string,
    req: IncomingMessage,
    res: ServerResponse,
): boolean {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', () => {
        try {
            const data = JSON.parse(body);

            if (data.status === 'approved') {
                const entry = ctx.dnaEngine.approveEntry(entryId);
                if (!entry) {
                    json(res, { error: 'Entry not found' }, 404);
                    return;
                }
                json(res, entry);
            } else if (data.status === 'rejected') {
                const entry = ctx.dnaEngine.rejectEntry(entryId);
                if (!entry) {
                    json(res, { error: 'Entry not found' }, 404);
                    return;
                }
                json(res, entry);
            } else if (data.content) {
                const entry = ctx.dnaEngine.editEntry(entryId, data.content);
                if (!entry) {
                    json(res, { error: 'Entry not found' }, 404);
                    return;
                }
                json(res, entry);
            } else {
                json(res, { error: 'No valid update fields' }, 400);
            }
        } catch {
            json(res, { error: 'Invalid JSON' }, 400);
        }
    });
    return true;
}

export async function handleHookContext(
    ctx: ServerContext,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const filePath = url.searchParams.get('file');
    const toolName = url.searchParams.get('tool');
    const projectRoot = url.searchParams.get('root');

    if (!filePath || !toolName || !projectRoot) {
        res.writeHead(400);
        res.end(JSON.stringify({ decision: 'allow' }));
        return;
    }

    try {
        const path = await import('node:path');
        const relativePath = path.default.isAbsolute(filePath)
            ? path.default.relative(projectRoot, filePath)
            : filePath;

        const fileNodeId = `file:${relativePath}`;

        if (!ctx.graphology.hasNode(fileNodeId)) {
            res.writeHead(200);
            res.end(JSON.stringify({ decision: 'allow' }));
            return;
        }

        const symbols: string[] = [];
        ctx.graphology.forEachOutEdge(
            fileNodeId,
            (_e: string, attrs: Record<string, unknown>, _s: string, target: string) => {
                if (attrs.type === 'contains') symbols.push(target);
            },
        );

        const dependencies = new Set<string>();
        for (const sym of symbols) {
            ctx.graphology.forEachOutEdge(
                sym,
                (_e: string, attrs: Record<string, unknown>, _s: string, target: string) => {
                    if (attrs.type !== 'contains' && !symbols.includes(target)) {
                        dependencies.add(target);
                    }
                },
            );
        }

        const dependents = new Set<string>();
        for (const sym of symbols) {
            ctx.graphology.forEachInEdge(
                sym,
                (_e: string, attrs: Record<string, unknown>, source: string) => {
                    if (attrs.type !== 'contains' && !symbols.includes(source)) {
                        dependents.add(source);
                    }
                },
            );
        }

        const constraints = ctx.intent
            .listEntries('constraint', { status: 'active' })
            .filter(
                (c) => c.frontmatter.scope === '*' || relativePath.includes(c.frontmatter.scope),
            )
            .map((c) => ({ scope: c.frontmatter.scope, content: c.content }));

        const dna = ctx.dnaEngine
            .getActiveEntries()
            .slice(0, 10)
            .map((e) => `[${e.frontmatter.category}] ${e.content}`);

        const lines: string[] = [];
        lines.push(`File context for ${relativePath}:`);

        if (symbols.length > 0) {
            lines.push('', 'Symbols:');
            for (const sym of symbols) {
                const attrs = ctx.graphology.getNodeAttributes(sym);
                lines.push(
                    `  - ${attrs.name} (${attrs.type}, lines ${attrs.lineStart}-${attrs.lineEnd})`,
                );
            }
        }

        if (dependencies.size > 0) {
            lines.push('', 'Dependencies:');
            for (const dep of dependencies) {
                const attrs = ctx.graphology.getNodeAttributes(dep);
                lines.push(`  - ${attrs.name} (${attrs.filePath})`);
            }
        }

        if (dependents.size > 0) {
            lines.push('', 'Dependents (will be affected by changes):');
            for (const dep of dependents) {
                const attrs = ctx.graphology.getNodeAttributes(dep);
                lines.push(`  - ${attrs.name} (${attrs.filePath})`);
            }
        }

        if (constraints.length > 0) {
            lines.push('', 'Constraints:');
            for (const c of constraints) {
                lines.push(`  - [${c.scope}] ${c.content}`);
            }
        }

        if (dna.length > 0) {
            lines.push('', 'Developer DNA:');
            for (const d of dna) {
                lines.push(`  - ${d}`);
            }
        }

        res.writeHead(200);
        res.end(JSON.stringify({ decision: 'allow', message: lines.join('\n') }));
    } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ decision: 'allow' }));
    }
}

export function handleInternalEvent(
    bus: EventBus,
    req: IncomingMessage,
    res: ServerResponse,
): void {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', () => {
        try {
            const event = JSON.parse(body) as SymbioteEvent;
            if (!EVENT_TYPES.includes(event.type as (typeof EVENT_TYPES)[number])) {
                res.writeHead(400);
                res.end();
                return;
            }
            bus.emit(event);
            res.writeHead(200);
            res.end();
        } catch {
            res.writeHead(400);
            res.end();
        }
    });
}

export function handleSseConnection(
    bus: EventBus,
    _req: IncomingMessage,
    res: ServerResponse,
): void {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });

    res.write('data: {"type":"connected"}\n\n');

    const handler = (event: SymbioteEvent): void => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    bus.on('*', handler);

    res.on('close', () => {
        bus.off('*', handler);
    });
}
