import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { ServerContext } from './context.js';
import type { EventBus } from '#events/bus.js';
import type { SymbioteEvent } from '#events/types.js';
import { EVENT_TYPES } from '#events/types.js';
import type {
    ConstraintViolation,
    CircularDep,
    DeadCodeEntry,
    CouplingHotspot,
} from '#brain/health/types.js';

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

export async function handleApiRequest(
    ctx: ServerContext,
    pathname: string,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> {
    res.setHeader('Access-Control-Allow-Origin', `http://localhost:${req.socket.localPort}`);
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
        return await handleUpdateDna(ctx, entryId, req, res);
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
        const symbols = await ctx.cortexRepo.getAllSymbols();
        const fileNodes = await ctx.repo.getAllNodes();
        const fileOnly = fileNodes.filter((n) => n.type === 'file');

        const maxDepth = await ctx.cortexRepo.getMaxDepthLevel();
        const communityCountStr = await ctx.cortexRepo.getMeta('community_count');

        type NodeAttrs = Record<string, unknown>;
        const getAttrs = (id: string): NodeAttrs =>
            ctx.graphology.hasNode(id) ? (ctx.graphology.getNodeAttributes(id) as NodeAttrs) : {};

        const nodes = [
            ...symbols.map((s) => {
                const attrs = getAttrs(s.id);
                return {
                    id: s.id,
                    type: s.kind,
                    name: s.name,
                    filePath: s.filePath,
                    lineStart: s.lineStart,
                    lineEnd: s.lineEnd,
                    metadata: {
                        community: (attrs.community as number) ?? null,
                        pageRank: (attrs.pagerank as number) ?? null,
                        betweenness: (attrs.centrality as number) ?? null,
                    },
                };
            }),
            ...fileOnly.map((n) => {
                const attrs = getAttrs(n.id);
                return {
                    ...n,
                    metadata: {
                        ...n.metadata,
                        community: (attrs.community as number) ?? n.metadata?.cluster ?? null,
                        pageRank: (attrs.pagerank as number) ?? n.metadata?.pagerank ?? null,
                        betweenness: (attrs.centrality as number) ?? n.metadata?.centrality ?? null,
                    },
                };
            }),
        ];

        const nodeIds = new Set(nodes.map((n) => n.id));

        const edgeTables: { table: string; kind: string }[] = [
            { table: 'edges_calls', kind: 'calls' },
            { table: 'edges_imports', kind: 'imports' },
            { table: 'edges_extends', kind: 'extends' },
            { table: 'edges_implements', kind: 'implements' },
            { table: 'edges_contains', kind: 'contains' },
            { table: 'edges_returns', kind: 'returns' },
            { table: 'edges_reads', kind: 'reads' },
            { table: 'edges_writes', kind: 'writes' },
        ];

        const edges: { sourceId: string; targetId: string; type: string }[] = [];
        for (const { table, kind } of edgeTables) {
            const rows = await ctx.db.all<{ source_id: string; target_id: string }>(
                `SELECT source_id, target_id FROM ${table}`,
            );
            for (const row of rows) {
                if (nodeIds.has(row.source_id) && nodeIds.has(row.target_id)) {
                    edges.push({
                        sourceId: row.source_id,
                        targetId: row.target_id,
                        type: kind,
                    });
                }
            }
        }

        return json(res, {
            data: { nodes, edges },
            depth: maxDepth,
            deepening: maxDepth < 7,
            communityCount: communityCountStr ? Number(communityCountStr) : 0,
        });
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
    const allConstraints = await ctx.intent.listEntries('constraint');
    const constraints = allConstraints.filter(
        (c) => c.frontmatter.scope === 'global' || node.filePath.startsWith(c.frontmatter.scope),
    );
    const allDecisions = await ctx.intent.listEntries('decision');
    const decisions = allDecisions.filter(
        (d) => d.frontmatter.scope === 'global' || node.filePath.startsWith(d.frontmatter.scope),
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

    type HealthIssueItem = ConstraintViolation | CircularDep | DeadCodeEntry | CouplingHotspot;

    const toIssues = (
        items: HealthIssueItem[],
        category: string,
        severity: 'error' | 'warning' | 'info',
    ) =>
        items.map((item) => ({
            severity,
            message:
                ('constraintDescription' in item ? item.constraintDescription : null) ??
                ('chain' in item ? item.chain.join(' \u2192 ') : null) ??
                ('node' in item ? item.node.name : null) ??
                String(item),
            filePath:
                ('filePath' in item ? item.filePath : null) ??
                ('node' in item ? item.node.filePath : '') ??
                '',
            line: 'lineStart' in item ? item.lineStart : undefined,
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
): Promise<boolean> {
    return new Promise((resolve) => {
        let body = '';
        let destroyed = false;
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > MAX_BODY_SIZE) {
                destroyed = true;
                res.writeHead(413);
                res.end('Payload too large');
                req.destroy();
                resolve(true);
            }
        });
        req.on('end', () => {
            if (destroyed) return;
            try {
                const data = JSON.parse(body) as Record<string, unknown>;

                if (data.status === 'approved') {
                    const entry = ctx.dnaEngine.approveEntry(entryId);
                    if (!entry) {
                        json(res, { error: 'Entry not found' }, 404);
                    } else {
                        json(res, entry);
                    }
                } else if (data.status === 'rejected') {
                    const entry = ctx.dnaEngine.rejectEntry(entryId);
                    if (!entry) {
                        json(res, { error: 'Entry not found' }, 404);
                    } else {
                        json(res, entry);
                    }
                } else if (typeof data.content === 'string') {
                    const entry = ctx.dnaEngine.editEntry(entryId, data.content);
                    if (!entry) {
                        json(res, { error: 'Entry not found' }, 404);
                    } else {
                        json(res, entry);
                    }
                } else {
                    json(res, { error: 'No valid update fields' }, 400);
                }
            } catch {
                json(res, { error: 'Invalid JSON' }, 400);
            }
            resolve(true);
        });
    });
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
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(projectRoot, filePath);
        const relativePath = path.relative(projectRoot, absolutePath);

        const fileNodeId = `file:${absolutePath}`;

        if (!ctx.graphology.hasNode(fileNodeId)) {
            res.writeHead(200);
            res.end(JSON.stringify({ decision: 'allow' }));
            return;
        }

        const symbolsList: string[] = [];
        ctx.graphology.forEachOutEdge(
            fileNodeId,
            (_e: string, attrs: Record<string, unknown>, _s: string, target: string) => {
                if (attrs.type === 'contains') symbolsList.push(target);
            },
        );
        const symbols = new Set(symbolsList);

        const dependencies = new Set<string>();
        for (const sym of symbols) {
            ctx.graphology.forEachOutEdge(
                sym,
                (_e: string, attrs: Record<string, unknown>, _s: string, target: string) => {
                    if (attrs.type !== 'contains' && !symbols.has(target)) {
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
                    if (attrs.type !== 'contains' && !symbols.has(source)) {
                        dependents.add(source);
                    }
                },
            );
        }

        const activeConstraints = await ctx.intent.listEntries('constraint', {
            status: 'active',
        });
        const constraints = activeConstraints
            .filter(
                (c) =>
                    c.frontmatter.scope === 'global' ||
                    c.frontmatter.scope === '*' ||
                    relativePath.startsWith(c.frontmatter.scope),
            )
            .map((c) => ({ scope: c.frontmatter.scope, content: c.content }));

        const dna = ctx.dnaEngine
            .getActiveEntries()
            .slice(0, 10)
            .map((e) => `[${e.frontmatter.category}] ${e.content}`);

        const lines: string[] = [];
        lines.push(`File context for ${relativePath}:`);

        if (symbols.size > 0) {
            lines.push('', 'Symbols:');
            for (const sym of symbols) {
                if (!ctx.graphology.hasNode(sym)) continue;
                const attrs = ctx.graphology.getNodeAttributes(sym);
                lines.push(
                    `  - ${attrs.name} (${attrs.type}, lines ${attrs.lineStart}-${attrs.lineEnd})`,
                );
            }
        }

        if (dependencies.size > 0) {
            lines.push('', 'Dependencies:');
            for (const dep of dependencies) {
                if (!ctx.graphology.hasNode(dep)) continue;
                const attrs = ctx.graphology.getNodeAttributes(dep);
                lines.push(`  - ${attrs.name} (${attrs.filePath})`);
            }
        }

        if (dependents.size > 0) {
            lines.push('', 'Dependents (will be affected by changes):');
            for (const dep of dependents) {
                if (!ctx.graphology.hasNode(dep)) continue;
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
        res.end(JSON.stringify({ decision: 'allow', additionalContext: lines.join('\n') }));
    } catch {
        res.writeHead(200);
        res.end(JSON.stringify({ decision: 'allow' }));
    }
}

const EVENT_TIMEOUT_MS = 10_000;

export function handleInternalEvent(
    bus: EventBus,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    return new Promise((resolve) => {
        let body = '';
        let destroyed = false;

        const timeout = setTimeout(() => {
            if (destroyed) return;
            destroyed = true;
            res.writeHead(408);
            res.end('Request timeout');
            req.destroy();
            resolve();
        }, EVENT_TIMEOUT_MS);

        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > MAX_BODY_SIZE) {
                destroyed = true;
                clearTimeout(timeout);
                res.writeHead(413);
                res.end('Payload too large');
                req.destroy();
                resolve();
            }
        });
        req.on('error', () => {
            if (destroyed) return;
            destroyed = true;
            clearTimeout(timeout);
            resolve();
        });
        req.on('end', () => {
            clearTimeout(timeout);
            if (destroyed) return;
            try {
                const event = JSON.parse(body) as SymbioteEvent;
                if (!EVENT_TYPES.includes(event.type as (typeof EVENT_TYPES)[number])) {
                    res.writeHead(400);
                    res.end();
                } else {
                    bus.emit(event);
                    res.writeHead(200);
                    res.end();
                }
            } catch {
                res.writeHead(400);
                res.end();
            }
            resolve();
        });
    });
}

export function handleSseConnection(
    bus: EventBus,
    req: IncomingMessage,
    res: ServerResponse,
): void {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': `http://localhost:${req.socket.localPort}`,
    });

    res.write('data: {"type":"connected"}\n\n');

    let closed = false;

    const cleanup = (): void => {
        if (closed) return;
        closed = true;
        bus.off('*', handler);
    };

    const handler = (event: SymbioteEvent): void => {
        if (closed) return;
        try {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
            cleanup();
        }
    };

    bus.on('*', handler);

    res.on('close', cleanup);
    res.on('error', cleanup);
}
