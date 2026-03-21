# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Symbiote is an AI-coding companion that gives AI tools persistent memory across sessions. It builds a local code knowledge graph (Tree-sitter + DuckDB), learns developer coding preferences (DNA engine), and exposes everything via MCP protocol.

## Monorepo Structure

Turborepo monorepo with two packages:

- **`packages/cli`** — Core engine, MCP server, CLI (`symbiote-cli` on npm)
- **`packages/web`** — Web UI for 3D brain visualization (Vite + React 19 + Three.js + Tailwind v4)

## Commands

```bash
# Build everything
npm run build

# Run all CLI tests
cd packages/cli && npx vitest run

# Run a specific test file
cd packages/cli && npx vitest run test/events/bus.test.ts

# Run tests in watch mode
cd packages/cli && npx vitest

# Type-check both packages
npx tsc -b --noEmit

# Format code
npm run format

# Web UI dev server
cd packages/web && npm run dev
```

## Code Style

Enforced by Prettier + pre-commit hooks (husky + lint-staged). No ESLint — Prettier only.

- 4-space indentation, single quotes, semicolons, trailing commas
- 100 char soft line limit
- Strict TypeScript: no `any`, no `@ts-ignore`, no `as unknown as`
- Explicit return types on exported functions
- `const` over `let`, never `var`; early returns over nesting
- No comments unless clarifying non-obvious logic; no dead code
- One module per file
- Conventional commits: `feat(scope): description`, `fix(scope): ...`, etc.

## Architecture

### CLI Package (`packages/cli`)

The CLI uses `#`-prefixed path aliases for clean imports (e.g., `#core/parser`, `#dna/engine`). These are defined in `packages/cli/tsconfig.json` and mirrored in `vitest.config.ts`.

**Layer stack (bottom to top):**

| Layer    | Path Alias  | Purpose                                                                                                                |
| -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Storage  | `#storage`  | DuckDB wrapper, node/edge/file persistence                                                                             |
| Core     | `#core`     | Tree-sitter parsing, graph building, embeddings, search, impact analysis                                               |
| Cortex   | `#cortex`   | 8-stage analysis pipeline (structure → symbols → resolution → call graph → types → flow → topology → intelligence)     |
| DNA      | `#dna`      | Developer preference learning engine — captures rules, tracks confidence, auto-promotes patterns                       |
| Brain    | `#brain`    | Health scoring (cycles, coupling, dead code, constraint violations) + intent store (decisions/constraints as markdown) |
| Events   | `#events`   | EventBus, IPC protocol, session lifecycle                                                                              |
| MCP      | `#mcp`      | MCP server (17 tools + 3 resources), HTTP API, proxy                                                                   |
| Hooks    | `#hooks`    | 9 Claude Code lifecycle hooks (session-start, pre/post-tool-use, etc.)                                                 |
| Commands | `#commands` | CLI command implementations                                                                                            |
| Init     | `#init`     | Agent/editor detection and bonding                                                                                     |

### Key Extension Points

**Adding a new MCP tool:**

1. Create handler in `packages/cli/src/mcp/tools/`
2. Register in `packages/cli/src/mcp/server.ts` with Zod schema
3. Add tests in `packages/cli/test/mcp/tools/`

**Adding language support (Tier 1):**

1. Add Tree-sitter grammar dependency
2. Write extraction queries in `packages/cli/src/core/parser.ts`
3. Register in `GRAMMAR_MAP` in `packages/cli/src/core/languages.ts`

### Data Storage

- **Per-project brain:** `.brain/symbiote.db` (DuckDB) + `.brain/intent/` (markdown decisions/constraints)
- **Global DNA profiles:** `~/.symbiote/profiles/*.json`
- **Global config:** `~/.symbiote/config.json`

## Testing

Vitest with globals enabled. Tests mirror `src/` structure under `packages/cli/test/`. Test fixtures live in `packages/cli/test/fixtures/`. Tests run sequentially (`fileParallelism: false`) with a 30-second timeout.
