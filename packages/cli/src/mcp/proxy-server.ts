import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function callProxy(port: number, tool: string, input: Record<string, unknown>): Promise<unknown> {
    const payload = JSON.stringify({ tool, input });

    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path: '/internal/mcp-proxy',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
                timeout: 30_000,
            },
            (res) => {
                let data = '';
                res.on('data', (chunk: string) => {
                    data += chunk;
                });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve({ error: 'Invalid JSON response' });
                    }
                });
            },
        );
        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Proxy request timed out'));
        });
        req.end(payload);
    });
}

function textResult(data: unknown): { type: 'text'; text: string } {
    return { type: 'text', text: JSON.stringify(data, null, 2) };
}

export function createProxyMcpServer(port: number): { server: McpServer } {
    const server = new McpServer({ name: 'symbiote', version: '0.1.1' });

    const proxy = (tool: string) => async (input: Record<string, unknown>) => ({
        content: [textResult(await callProxy(port, tool, input))],
    });

    server.tool(
        'get_developer_dna',
        "Returns the developer's coding style, preferences, and anti-patterns.",
        {
            category: z
                .string()
                .optional()
                .describe('Filter by category: style, preferences, anti-patterns, decisions'),
            taskContext: z
                .string()
                .optional()
                .describe('Description of the current task for relevance filtering'),
        },
        proxy('get_developer_dna'),
    );

    server.tool(
        'record_instruction',
        'Record a developer correction or coding preference as DNA.',
        {
            instruction: z.string().describe('The correction or preference to record'),
            sessionId: z.string().optional().default('').describe('Current session identifier'),
            isExplicit: z
                .boolean()
                .optional()
                .default(false)
                .describe('True if the developer explicitly asked to record this'),
            category: z
                .enum(['style', 'preferences', 'anti-patterns', 'decisions'])
                .optional()
                .describe('Category for this instruction'),
        },
        proxy('record_instruction'),
    );

    server.tool(
        'get_project_overview',
        "Returns the project's structure, stats, and health summary.",
        {},
        proxy('get_project_overview'),
    );

    server.tool(
        'get_context_for_file',
        'Returns everything about a specific file.',
        { filePath: z.string().describe('The file path to get context for') },
        proxy('get_context_for_file'),
    );

    server.tool(
        'query_graph',
        'Query the code graph using SQL/PGQ or plain SQL.',
        {
            query: z.string().describe('SQL or SQL/PGQ query (read-only SELECT only)'),
            type: z
                .enum(['search', 'dependencies', 'dependents', 'hubs'])
                .optional()
                .describe('[DEPRECATED] Legacy query type'),
            limit: z.number().optional().default(20).describe('[DEPRECATED] Legacy limit'),
        },
        proxy('query_graph'),
    );

    server.tool(
        'semantic_search',
        'Natural language search over the codebase using vector embeddings.',
        {
            query: z.string().describe("Natural language description of what you're looking for"),
            limit: z.number().optional().default(10).describe('Maximum number of results'),
        },
        proxy('semantic_search'),
    );

    server.tool('get_health', "Returns the project's health report.", {}, proxy('get_health'));

    server.tool(
        'get_impact',
        'Analyze blast radius: what breaks if a given symbol changes.',
        {
            target: z.string().describe('Node ID of the symbol to analyze'),
            maxDepth: z.number().optional().default(3).describe('Maximum traversal depth'),
        },
        proxy('get_impact'),
    );

    server.tool('detect_changes', 'Analyze uncommitted git changes.', {}, proxy('detect_changes'));

    server.tool(
        'find_patterns',
        'Detect anti-patterns, architectural violations, and complexity hotspots.',
        {
            scope: z.string().describe('Scope to search: file path, directory, or "all"'),
            kinds: z
                .array(
                    z.enum([
                        'god_class',
                        'circular_dependency',
                        'feature_envy',
                        'shotgun_surgery',
                        'layer_violation',
                        'dependency_direction',
                        'barrel_abuse',
                        'complexity_hotspot',
                        'style_deviation',
                        'decision_contradiction',
                        'predictive_impact',
                    ]),
                )
                .optional()
                .describe('Filter by specific finding kinds'),
            severity: z
                .enum(['info', 'warning', 'error'])
                .optional()
                .describe('Minimum severity to include'),
        },
        proxy('find_patterns'),
    );

    server.tool(
        'get_architecture',
        'Get detected architectural layers, boundaries, and violation summary.',
        {},
        proxy('get_architecture'),
    );

    server.tool(
        'get_context_for_symbol',
        'Deep dive into one function, class, or method.',
        {
            symbol: z.string().describe('Symbol name or ID'),
        },
        proxy('get_context_for_symbol'),
    );

    server.tool(
        'rename_symbol',
        'Graph-aware multi-file rename preview.',
        {
            symbol: z.string().describe('Symbol name or ID to rename'),
            new_name: z.string().describe('New name for the symbol'),
            scope: z
                .enum(['file', 'project'])
                .optional()
                .default('project')
                .describe('Scope of rename'),
        },
        proxy('rename_symbol'),
    );

    server.tool(
        'get_constraints',
        'Returns active project constraints.',
        {
            scope: z.string().optional().describe('Filter by scope (e.g. file path)'),
        },
        proxy('get_constraints'),
    );

    server.tool(
        'get_decisions',
        'Returns architectural decisions.',
        {
            scope: z.string().optional().describe('Filter by scope (e.g. file path)'),
        },
        proxy('get_decisions'),
    );

    server.tool(
        'propose_constraint',
        'Propose a new project constraint.',
        {
            id: z.string().describe('Unique constraint ID'),
            content: z.string().describe('The constraint rule text'),
            scope: z.string().optional().default('global').describe('Scope'),
        },
        proxy('propose_constraint'),
    );

    server.tool(
        'propose_decision',
        'Record an architectural decision with rationale.',
        {
            id: z.string().describe('Unique decision ID'),
            content: z.string().describe('The decision text with rationale'),
            scope: z.string().optional().default('global').describe('Scope'),
        },
        proxy('propose_decision'),
    );

    server.tool(
        'trace_flow',
        'Trace execution flow from an entry point through calls and data flows.',
        {
            entryPoint: z.string().describe('Symbol ID or name to start tracing from'),
            maxDepth: z.number().optional().default(5).describe('Maximum traversal depth'),
            includeAsync: z.boolean().optional().default(true).describe('Include async call edges'),
            includeErrors: z
                .boolean()
                .optional()
                .default(false)
                .describe('Include error/return paths'),
        },
        proxy('trace_flow'),
    );

    server.tool(
        'trace_data',
        'Trace data flow forward or backward from a symbol.',
        {
            symbol: z.string().describe('Symbol ID or name to trace data flow from'),
            direction: z
                .enum(['forward', 'backward'])
                .default('forward')
                .describe('Trace direction'),
            maxDepth: z.number().optional().default(5).describe('Maximum traversal depth'),
        },
        proxy('trace_data'),
    );

    server.tool(
        'find_implementations',
        'Find all classes that implement an interface or extend a base class.',
        {
            interfaceName: z.string().describe('Interface or base class name/ID'),
            includeIndirect: z
                .boolean()
                .optional()
                .default(false)
                .describe('Include indirect implementations'),
        },
        proxy('find_implementations'),
    );

    server.resource('dna', 'symbiote://dna', { description: 'Developer DNA summary' }, async () => {
        const data = (await callProxy(port, 'resource:dna', {})) as { text?: string };
        return {
            contents: [
                {
                    uri: 'symbiote://dna',
                    text: data.text ?? '',
                    mimeType: 'text/plain',
                },
            ],
        };
    });

    server.resource(
        'project-overview',
        'symbiote://project/overview',
        { description: 'Project summary' },
        async () => {
            const data = (await callProxy(port, 'resource:project-overview', {})) as {
                text?: string;
            };
            return {
                contents: [
                    {
                        uri: 'symbiote://project/overview',
                        text: data.text ?? '',
                        mimeType: 'text/plain',
                    },
                ],
            };
        },
    );

    server.resource(
        'project-health',
        'symbiote://project/health',
        { description: 'Current project health' },
        async () => {
            const data = (await callProxy(port, 'resource:project-health', {})) as {
                text?: string;
            };
            return {
                contents: [
                    {
                        uri: 'symbiote://project/health',
                        text: data.text ?? '',
                        mimeType: 'text/plain',
                    },
                ],
            };
        },
    );

    return { server };
}
