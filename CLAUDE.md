# Synapse

AI-powered project brain and developer DNA engine. A living, queryable knowledge layer for your codebase.

## Tech Stack

- TypeScript (strict mode, zero errors, zero warnings)
- Turborepo monorepo (packages/cli + packages/web)
- Tree-sitter (code parsing, all Tier 1 languages)
- better-sqlite3 + sqlite-vec (graph storage + vector search)
- @modelcontextprotocol/sdk (MCP server, stdio + HTTP)
- Transformers.js (local embeddings, all-MiniLM-L6-v2)
- Commander.js (CLI)
- Vite + React 19 (web UI)
- react-three-fiber + three-forcegraph (3D brain graph)
- Tailwind CSS v4 (dark theme)
- Vercel AI SDK (chat interface)
- Vitest (testing)

## Architecture

- `packages/cli/` — Core engine, CLI, MCP server
  - `src/core/` — Scanner, parser, graph queries, language detection
  - `src/storage/` — SQLite database, repository (CRUD)
  - `src/dna/` — Developer DNA engine (capture, propose, manage)
  - `src/mcp/` — MCP server (tools, resources, transports)
  - `src/brain/` — Project brain (intent layer, health analysis)
  - `src/utils/` — File walking, hashing, config
  - `bin/` — CLI entry point
- `packages/web/` — Web UI (Vite + React)
  - `src/views/graph/` — 3D brain graph
  - `src/views/chat/` — Ask Your Project
  - `src/views/health/` — Health Pulse dashboard
  - `src/views/dna/` — DNA Lab

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

- `.brain/` — Per-project brain directory (gitignored, auto-generated)
- `~/.synapse/` — Global developer DNA
- `~/.synapse/dna/` — DNA entries (style, preferences, anti-patterns, decisions)

## Testing

- All tests in `packages/cli/test/` mirroring `src/` structure
- Test fixtures in `packages/cli/test/fixtures/`
- Run tests: `npm test` (root) or `cd packages/cli && npx vitest run`
- Tests must be independent, no shared mutable state between tests

## CLI Commands

```
npx synapse              # Scan + launch server + UI
npx synapse init         # First-time setup
npx synapse scan         # Rescan codebase
npx synapse scan --force # Full rescan
npx synapse serve        # MCP server + web UI
npx synapse mcp          # MCP server only (stdio)
npx synapse dna          # View/manage DNA
```

## MCP Server

- 11 tools: get_developer_dna, get_project_overview, get_context_for_file, query_graph, semantic_search, get_constraints, get_decisions, get_health, propose_decision, propose_constraint, record_instruction
- 3 resources: synapse://dna, synapse://project/overview, synapse://project/health
- stdio transport for editor integration, HTTP for web UI
- Zod schemas for all tool inputs

## Design Principles

- **Plug and play** — Zero config, zero extra work
- **Local-first** — Everything runs locally, no external services (chat is the sole exception)
- **Tool-agnostic** — Works with any MCP-compatible AI tool
- **Non-blocking** — Never interrupts the developer's flow
- **Incremental** — Only re-parses changed files

## Formatting

Code in the implementation plans (docs/) uses 2-space indentation as placeholder.
ALL actual code MUST use 4-space indentation, single quotes, and semicolons.
When implementing from plans, convert indentation and quote style accordingly.

## Internal Docs

Design specs and implementation plans are in `docs/` (gitignored).
Read them for full architecture context:
- `docs/superpowers/specs/2026-03-16-synapse-design.md`
- `docs/superpowers/plans/2026-03-16-synapse-plan-{1..5}-*.md`

## Author

- Name: Mohamed Ashraf
- Email: cupo.ashraf@gmail.com
- GitHub: MohmmedAshraf
