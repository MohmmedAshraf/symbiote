import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from './context.js';

export function handleApiRequest(
    ctx: ServerContext,
    pathname: string,
    req: IncomingMessage,
    res: ServerResponse
): boolean {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PATCH, OPTIONS'
    );
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    if (pathname === '/api/graph' && req.method === 'GET') {
        return handleGetGraph(ctx, res);
    }

    if (
        pathname.startsWith('/api/graph/nodes/') &&
        req.method === 'GET'
    ) {
        const nodeId = decodeURIComponent(
            pathname.slice('/api/graph/nodes/'.length)
        );
        return handleGetNodeContext(ctx, nodeId, res);
    }

    if (pathname === '/api/health' && req.method === 'GET') {
        return handleGetHealthApi(ctx, res);
    }

    if (pathname === '/api/dna' && req.method === 'GET') {
        return handleListDna(ctx, res);
    }

    if (
        pathname.startsWith('/api/dna/') &&
        req.method === 'PATCH'
    ) {
        const entryId = decodeURIComponent(
            pathname.slice('/api/dna/'.length)
        );
        return handleUpdateDna(ctx, entryId, req, res);
    }

    if (pathname === '/api/chat' && req.method === 'POST') {
        return handleChat(ctx, req, res);
    }

    return false;
}

function json(
    res: ServerResponse,
    data: unknown,
    status = 200
): boolean {
    res.writeHead(status, {
        'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(data));
    return true;
}

function handleGetGraph(
    ctx: ServerContext,
    res: ServerResponse
): boolean {
    const nodes = ctx.repo.getAllNodes();
    const edges = ctx.repo.getAllEdges();
    return json(res, { nodes, edges });
}

function handleGetNodeContext(
    ctx: ServerContext,
    nodeId: string,
    res: ServerResponse
): boolean {
    const node = ctx.repo.getNodeById(nodeId);
    if (!node) {
        return json(res, { error: 'Node not found' }, 404);
    }

    const dependencies = ctx.graph.getDependencies(nodeId);
    const dependents = ctx.graph.getDependents(nodeId);
    const constraints = ctx.intent
        .listEntries('constraint')
        .filter(
            (c) =>
                c.frontmatter.scope === 'global' ||
                node.filePath.startsWith(c.frontmatter.scope)
        );
    const decisions = ctx.intent
        .listEntries('decision')
        .filter(
            (d) =>
                d.frontmatter.scope === 'global' ||
                node.filePath.startsWith(d.frontmatter.scope)
        );

    return json(res, {
        node,
        dependencies,
        dependents,
        constraints,
        decisions,
    });
}

function handleGetHealthApi(
    ctx: ServerContext,
    res: ServerResponse
): boolean {
    const report = ctx.health.analyze();
    return json(res, report);
}

function handleListDna(
    ctx: ServerContext,
    res: ServerResponse
): boolean {
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
    res: ServerResponse
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
                const entry = ctx.dnaEngine.editEntry(
                    entryId,
                    data.content
                );
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

function handleChat(
    ctx: ServerContext,
    req: IncomingMessage,
    res: ServerResponse
): boolean {
    let body = '';
    req.on('data', (chunk) => {
        body += chunk;
    });
    req.on('end', () => {
        try {
            const { message } = JSON.parse(body);
            if (!message || typeof message !== 'string') {
                json(
                    res,
                    { error: 'Missing message field' },
                    400
                );
                return;
            }

            const overview = ctx.graph.getOverview();

            res.writeHead(200, {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
            });

            res.write(
                'Chat is not configured. Set an LLM provider in ' +
                    '~/.synapse/config.json (supported: openai, anthropic, ollama). ' +
                    `\n\nProject has ${overview.totalNodes} nodes and ${overview.totalEdges} edges.`
            );
            res.end();
        } catch {
            if (!res.headersSent) {
                json(res, { error: 'Chat failed' }, 500);
            }
        }
    });
    return true;
}
