# Symbiote — Claude Code Plugin

AI coding companion with persistent memory. Gives Claude Code a code knowledge graph, developer DNA (learned coding preferences), and architectural intelligence.

## What It Does

- **Code Knowledge Graph** — Tree-sitter parsing + DuckDB graph of every symbol, dependency, and call chain
- **Developer DNA** — Learns your coding preferences and enforces them across sessions
- **Impact Analysis** — Traces the blast radius of any change through the dependency graph
- **Architecture Guardian** — Detects circular dependencies, coupling hotspots, layer violations
- **Persistent Memory** — Context survives session restarts, compaction, and subagent spawning

## Installation

```bash
/plugin marketplace add MohmmedAshraf/synapse
/plugin install symbiote@symbiote-plugins
```

No other setup required. The plugin auto-installs `symbiote-cli` from npm on first use via `npx -y`. The MCP server, hooks, and CLI are all bootstrapped automatically.

## Getting Started

1. Install the plugin (see above)
2. Run `/reload-plugins` to activate
3. Run `/symbiote-init` to scan your project and extract your coding DNA

The plugin will scan your codebase, learn your coding preferences, and start injecting context into every interaction.

## Components

### MCP Server (20 tools + 3 resources)

Registered automatically via `.mcp.json`. Provides code graph queries, impact analysis, semantic search, DNA management, and architectural intelligence. Uses `npx -y symbiote-cli mcp` — auto-downloads and caches the CLI on first run.

### Skills

| Skill              | Trigger                                  | Purpose                                                      |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------ |
| `/symbiote-init`   | "initialize symbiote", "scan my project" | First-time project setup — scan, extract DNA, write overview |
| `/symbiote-scan`   | "rescan project", "rebuild index"        | Update knowledge graph after changes                         |
| `/symbiote-impact` | "analyze impact", "what will break"      | Trace blast radius before making changes                     |
| `/symbiote-dna`    | "show preferences", "manage DNA"         | View/manage coding style preferences                         |

### Agents

| Agent                   | Triggers On                                   | Purpose                                                |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `code-reviewer`         | "review my changes", "review this PR"         | Graph-aware code review with DNA + constraint checking |
| `architecture-guardian` | "check architecture", "find layer violations" | Structural health analysis                             |
| `refactoring-advisor`   | "plan refactoring", "rename across codebase"  | Safe refactoring with dependency tracing               |

### Hooks (9 lifecycle events)

All Claude Code lifecycle events are wired to Symbiote's intelligence engine. Hooks gracefully degrade — if the project hasn't been scanned yet or the server isn't running, they silently exit without blocking Claude Code.

- **SessionStart** — Auto-starts the server, loads project context, DNA, constraints, health alerts
- **PreToolUse** — Injects file dependency context before reads/edits
- **PostToolUse** — Reindexes modified files, tracks symbol changes
- **UserPromptSubmit** — Adds relevant code context via semantic search
- **SubagentStart** — Injects top DNA rules and constraints into subagents
- **PreCompact** — Preserves critical context before compaction
- **Stop** — Runs lightweight analysis tracking
- **SessionEnd** — Finalizes session snapshot

## How It Works

1. **Plugin install** — registers MCP server + hooks + skills + agents with Claude Code
2. **First session** — SessionStart hook auto-installs `symbiote-cli` if needed
3. **`/symbiote-init`** — scans codebase, builds knowledge graph, extracts coding DNA
4. **Every session after** — hooks inject context (dependencies, DNA, constraints) into every tool call
5. **On-demand** — use skills for rescan, impact analysis, DNA management; agents for review and refactoring

## Architecture

```
plugin/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── .mcp.json                    # MCP server (npx -y symbiote-cli mcp)
├── hooks/
│   ├── hooks.json               # 9 lifecycle hooks
│   └── scripts/
│       ├── session-start.sh     # Auto-installs CLI, bootstraps server
│       └── symbiote-hook.sh     # Forwards events to server (graceful degradation)
├── skills/
│   ├── symbiote-init/           # Project initialization
│   ├── symbiote-scan/           # Codebase rescan
│   ├── symbiote-impact/         # Impact analysis
│   └── symbiote-dna/            # DNA management
└── agents/
    ├── code-reviewer.md         # Graph-aware code review
    ├── architecture-guardian.md  # Structural health
    └── refactoring-advisor.md   # Safe refactoring
```

## License

MIT
