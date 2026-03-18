# Symbiote

Bonds with your AI coding tools, giving them a brain that understands your project and a DNA that carries your style. One command. Every session. Zero cold start.

## Tech Stack

- TypeScript (strict mode, zero errors, zero warnings)
- Turborepo monorepo (packages/cli + packages/web)
- Tree-sitter (code parsing, 11 bundled languages)
- DuckDB + sqlite-vec (graph storage + vector search)
- @modelcontextprotocol/sdk (MCP server, stdio + HTTP)
- Transformers.js (local embeddings, all-MiniLM-L6-v2)
- Graphology (graph algorithms — Louvain, PageRank, betweenness)
- Vite + React 19 (web UI)
- react-three-fiber + Three.js + custom GLSL (3D brain visualization)
- Tailwind CSS v4 (dark theme)
- Vitest (testing — 356 tests across 56 files)

## Architecture

- `packages/cli/` — Core engine, CLI, MCP server
    - `src/core/` — Scanner, parser, graph queries, language detection, impact analysis
    - `src/storage/` — DuckDB database, repository (CRUD)
    - `src/dna/` — Developer DNA engine (capture, propose, manage)
    - `src/mcp/` — MCP server (tools, resources, transports, SSE events)
    - `src/brain/` — Project brain (intent layer, health analysis)
    - `src/events/` — EventBus, IPC bridge, session tracker
    - `src/hooks/` — Claude Code pre/post tool-use hooks
    - `src/init/` — Agent detection, bonding, rule import, DNA bootstrap
    - `src/utils/` — File walking, hashing, config
    - `bin/` — CLI entry point
- `packages/web/` — Web UI (Vite + React)
    - `src/views/graph/` — 3D brain graph with real-time event visualization
    - `src/views/health/` — Health Pulse dashboard
    - `src/views/dna/` — DNA Lab
    - `src/lib/` — SSE events hook, events context, API client

## Conventions

- ESM modules (`"type": "module"`) — use `createRequire(import.meta.url)` for native modules
- 4-space indentation everywhere (TypeScript, JSON, config files)
- Strict TypeScript — `strict: true`, no `any`, no `@ts-ignore`, no `as unknown as`
- Zero compiler errors and zero warnings at all times
- Vitest for all tests, TDD workflow (failing test → implementation → passing test)
- Frequent, small commits with conventional commit messages
- No comments unless they clarify genuinely non-obvious logic
- No dead code, no unused imports, no unused variables
- One module per file, clear single responsibility
- Types defined close to where they're used, exported from module index files

## Code Style

- 4-space indentation (tabs: false)
- Single quotes for strings
- Semicolons required
- Trailing commas in multiline
- Max line length: 100 characters (soft limit)
- Explicit return types on exported functions
- Prefer `const` over `let`, never `var`
- Prefer early returns over nested conditions
- Prefer composition over inheritance
- Prefer small, focused functions over large ones

## Key Files

- `.brain/` — Per-project brain directory (DB is gitignored, intent layer is committed)
- `~/.symbiote/` — Global developer DNA
- `~/.symbiote/dna/` — DNA entries (style, preferences, anti-patterns, decisions)
- `~/.claude/hooks/symbiote/` — Global Claude Code hook script
- `~/.claude/settings.json` — Claude Code hooks registration

## Testing

- All tests in `packages/cli/test/` mirroring `src/` structure
- Test fixtures in `packages/cli/test/fixtures/`
- Run tests: `npm test` (root) or `cd packages/cli && npx vitest run`
- Tests must be independent, no shared mutable state between tests

## CLI Commands

```
symbiote install           # Install globally (hooks + /symbiote-init skill)
symbiote scan              # Rescan codebase (incremental)
symbiote scan --force      # Full rescan
symbiote serve             # MCP server + web UI (localhost:3333)
symbiote mcp               # MCP server only (stdio, for editors)
symbiote dna               # View/manage developer DNA
symbiote impact            # Analyze impact of working changes
symbiote unbond            # Detach from all AI agents
```

## MCP Server

- 13 tools: get_developer_dna, get_project_overview, get_context_for_file, query_graph, semantic_search, get_constraints, get_decisions, get_health, get_impact, detect_changes, propose_decision, propose_constraint, record_instruction
- 3 resources: symbiote://dna, symbiote://project/overview, symbiote://project/health
- stdio transport for editor integration, HTTP + SSE for web UI
- Zod schemas for all tool inputs

## Real-Time Event System

- Hooks fire on every Claude Code tool call (pre + post)
- Hook processes send events via HTTP POST to running server
- Server distributes events via SSE to the brain UI
- Events: file:read, file:edit, file:create, node:reindexed, scan:complete, dna:recorded, dna:promoted, correction:detected, context:cluster, constraint:violated, impact:ripple
- Brain nodes glow on read, pulse on edit, bloom on create

## Host Integration

- `symbiote init` auto-detects: Claude Code, Cursor, Windsurf, Copilot, OpenCode
- Claude Code: MCP server + global hooks (deepest integration)
- Other hosts: MCP server only (AI calls tools when it needs context)
- Hooks registered globally at `~/.claude/settings.json` — work across all projects
- `symbiote unbond` cleanly removes MCP config and hooks

## Design Principles

- **Plug and play** — Zero config, auto-bonds on init
- **Local-first** — Everything runs locally, no external services
- **Tool-agnostic** — Works with any MCP-compatible AI tool
- **Non-blocking** — Never interrupts the developer's flow
- **Incremental** — Only re-parses changed files

## Formatting

Code in the implementation plans (docs/) uses 2-space indentation as placeholder.
ALL actual code MUST use 4-space indentation, single quotes, and semicolons.
When implementing from plans, convert indentation and quote style accordingly.

## Internal Docs

Design specs and implementation plans are in `docs/` (gitignored).

- `docs/superpowers/specs/2026-03-16-symbiote-v2-design.md`
- `docs/superpowers/plans/2026-03-16-symbiote-v2-phase-a.md`

## Author

- Name: Mohamed Ashraf
- Email: cupo.ashraf@gmail.com
- GitHub: MohmmedAshraf
