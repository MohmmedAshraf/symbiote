# Contributing to Symbiote

Thanks for wanting to contribute. Here's everything you need to get started.

## Setup

```bash
git clone https://github.com/MohmmedAshraf/symbiote.git
cd symbiote
npm install
```

This is a Turborepo monorepo with two packages:

- `packages/cli` — Core engine, MCP server, CLI
- `packages/web` — Web UI (Vite + React)

## Development

```bash
# Build everything
npm run build

# Run CLI tests
cd packages/cli && npx vitest run

# Run tests in watch mode
cd packages/cli && npx vitest

# Type-check both packages
npx tsc -b --noEmit

# Build web UI
cd packages/web && npm run build

# Start dev server (web)
cd packages/web && npm run dev
```

## Code Style

This project enforces strict conventions. Your PR will be rejected if it doesn't follow them.

- **4-space indentation** everywhere (TypeScript, JSON, config)
- **Single quotes**, semicolons, trailing commas
- **Strict TypeScript** — no `any`, no `@ts-ignore`, no `as unknown as`
- **Zero warnings** — unused imports, unused variables, all of it
- **No comments** unless they clarify genuinely non-obvious logic
- **No dead code** — if it's not used, delete it
- **One module per file** — clear single responsibility
- **Explicit return types** on exported functions
- **`const` over `let`**, never `var`
- **Early returns** over nested conditions

Prettier runs on pre-commit hooks via lint-staged. Type-check runs after staging. If the hook fails, fix the issue — don't skip the hook.

## Testing

All tests live at `packages/cli/test/` mirroring the `src/` structure. We use Vitest.

- Write tests first (TDD) — failing test, then implementation, then green
- Tests must be independent — no shared mutable state between tests
- Test fixtures go in `packages/cli/test/fixtures/`

```bash
# Run a specific test file
cd packages/cli && npx vitest run test/events/bus.test.ts

# Run all tests
cd packages/cli && npx vitest run
```

## Commits

Use [conventional commits](https://www.conventionalcommits.org/):

```
feat(events): add session tracker
fix(hooks): prevent duplicate IPC calls
docs: update README with unbond command
refactor(dna): simplify pattern matching
test(health): add coupling analyzer edge cases
```

Keep commits small and focused. One logical change per commit.

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes following the code style above
3. Write or update tests for your changes
4. Make sure all tests pass: `cd packages/cli && npx vitest run`
5. Make sure TypeScript compiles: `npx tsc -b --noEmit`
6. Open a PR with a clear description of what and why

### PR title format

Same as commit format: `feat(scope): description`

### What makes a good PR

- Solves one thing
- Has tests
- Passes CI
- Doesn't introduce new warnings or dead code
- Follows existing patterns in the codebase

## Architecture Overview

If you're contributing to a specific area, here's where things live:

| Area              | Location                                  | What it does                                                                                                                                               |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code parsing      | `packages/cli/src/core/parser.ts`         | Tree-sitter AST → nodes + edges                                                                                                                            |
| Graph queries     | `packages/cli/src/core/graph.ts`          | Dependency traversal, symbol lookup                                                                                                                        |
| Graph algorithms  | `packages/cli/src/core/algorithms.ts`     | PageRank, Louvain, betweenness                                                                                                                             |
| Embeddings        | `packages/cli/src/core/embeddings.ts`     | Transformers.js vector generation                                                                                                                          |
| Semantic search   | `packages/cli/src/core/search.ts`         | Hybrid keyword + vector search                                                                                                                             |
| Impact analysis   | `packages/cli/src/core/impact.ts`         | Blast radius from changes                                                                                                                                  |
| DNA engine        | `packages/cli/src/dna/engine.ts`          | Capture, match, promote traits                                                                                                                             |
| DNA storage       | `packages/cli/src/dna/profile.ts`         | JSON profile files in `~/.symbiote/profiles/`                                                                                                              |
| MCP server        | `packages/cli/src/mcp/server.ts`          | Tool + resource registration                                                                                                                               |
| MCP tools         | `packages/cli/src/mcp/tools/`             | Individual tool handlers                                                                                                                                   |
| Health engine     | `packages/cli/src/brain/health/`          | Scoring, cycle detection, coupling                                                                                                                         |
| Intent layer      | `packages/cli/src/brain/intent.ts`        | Decisions + constraints store                                                                                                                              |
| Event system      | `packages/cli/src/events/`                | EventBus, IPC, session tracking                                                                                                                            |
| Indexing pipeline | `packages/cli/src/cortex/`                | 8-stage scan: structure → symbols → resolution → call graph → types → flow → topology → intelligence                                                       |
| Hooks             | `packages/cli/src/hooks/`                 | 9 Claude Code lifecycle hooks (HTTP + command + prompt)                                                                                                    |
| Hook handlers     | `packages/cli/src/hooks/handlers/`        | Individual handlers: session-start, pre-tool-use, post-tool-use, user-prompt-submit, pre-compact, stop, session-end, subagent-start, post-tool-use-failure |
| Session store     | `packages/cli/src/hooks/session-store.ts` | Session + observation persistence in DuckDB                                                                                                                |
| Attention set     | `packages/cli/src/hooks/attention.ts`     | In-memory file/symbol focus tracking with decay                                                                                                            |
| Init/bonding      | `packages/cli/src/init/`                  | Agent detection, MCP registration, rule import, DNA bootstrap                                                                                              |
| CLI commands      | `packages/cli/src/commands/`              | Command implementations (install, scan, serve, dna, etc.)                                                                                                  |
| CLI entry         | `packages/cli/bin/symbiote.ts`            | CLI argument parsing and dispatch                                                                                                                          |
| 3D brain          | `packages/web/src/views/graph/`           | Three.js scene, neurons, synapses                                                                                                                          |
| Web UI            | `packages/web/src/`                       | React app, routing, API client                                                                                                                             |

## Adding a New MCP Tool

1. Create the handler in `packages/cli/src/mcp/tools/`
2. Register it in `packages/cli/src/mcp/server.ts` with a Zod schema
3. Add tests in `packages/cli/test/mcp/tools/`
4. Update the MCP tools table in `README.md`

## Adding Language Support

Tier 1 languages have dedicated Tree-sitter query patterns in `packages/cli/src/core/parser.ts`. To add a new Tier 1 language:

1. Add the grammar dependency
2. Write extraction queries for functions, classes, imports, calls
3. Add tests with fixture files in `packages/cli/test/fixtures/`
4. Add to the `GRAMMAR_MAP` in `packages/cli/src/core/languages.ts`

## Questions?

Open an issue. Keep it specific — what you're trying to do, what you expected, what happened instead.
