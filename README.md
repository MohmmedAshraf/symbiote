<div align="center">

<img src="art/cover.png" alt="Symbiote" width="100%" />

**Your codebase gets a brain. Your AI never forgets who you are.**

A living, queryable knowledge layer for your codebase that makes every AI coding tool understand your project and your style.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/symbiote-cli.svg)](https://www.npmjs.com/package/symbiote-cli)

</div>

---

## The Problem

AI coding assistants lose context every session. They hallucinate, ignore your conventions, and repeat the same mistakes. You write CLAUDE.md files, cursor rules, memory files — all static, all manual, all incomplete. Every new project is a cold start.

## The Solution

One command. Every AI tool. Zero cold start.

```bash
npx symbiote
```

Symbiote scans your codebase and builds a **living project brain** — a knowledge graph of every function, class, import, and dependency. Then it layers on your **Developer DNA** — your personal coding style, preferences, and patterns learned from your corrections and instructions across every project you work on.

Any AI tool that connects via MCP instantly understands both your project and you.

## Features

### Project Brain

- **Code Graph** — Every function, class, import, and dependency mapped and queryable
- **Intent Layer** — Architectural decisions, constraints, and rationale that travel with the repo
- **Constraint Enforcement** — Define rules ("no raw SQL") and violations are flagged automatically
- **Health Pulse** — Dead code, circular dependencies, coupling hotspots, and a 0-100 health score

### Developer DNA

- **Learned From You** — Built from your corrections and instructions to AI, not from AI-generated code
- **Follows You Everywhere** — One DNA across all your projects, zero cold start
- **Always Evolving** — Symbiote proposes DNA updates as you work, you approve or reject
- **Non-Blocking** — Review DNA proposals in the dashboard when you feel like it, or don't

### Visual Brain

- **3D Knowledge Graph** — Interactive force-directed visualization of your entire codebase
- **Ask Your Project** — Chat interface where you talk to your project, not to an AI
- **Health Dashboard** — Real-time code health monitoring with actionable insights
- **DNA Lab** — View, approve, and manage your coding DNA

## Quick Start

```bash
# Initialize in any project
npx symbiote

# Connect to Claude Code
claude mcp add symbiote -- npx symbiote mcp

# Connect to Cursor (~/.cursor/mcp.json)
{
    "mcpServers": {
        "symbiote": {
            "command": "npx",
            "args": ["symbiote", "mcp"]
        }
    }
}
```

## CLI

```bash
npx symbiote              # Scan + launch server + UI
npx symbiote init         # First-time project setup
npx symbiote scan         # Rescan codebase
npx symbiote scan --force # Full rescan (ignore cache)
npx symbiote serve        # MCP server + web UI
npx symbiote mcp          # MCP server only (stdio, for editors)
npx symbiote dna          # View and manage your Developer DNA
```

## How It Works

```
You code normally
    ↓
Symbiote watches, builds a knowledge graph of your codebase
    ↓
AI tool connects via MCP
    ↓
Symbiote provides: project architecture + your coding style + active constraints
    ↓
AI writes code that actually fits your project and your preferences
    ↓
You correct the AI? Symbiote captures it as a DNA update
    ↓
Next session, any project → AI already knows
```

## MCP Tools

| Tool                   | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `get_developer_dna`    | Your coding style, preferences, and anti-patterns |
| `get_project_overview` | Tech stack, structure, key modules, entry points  |
| `get_context_for_file` | Dependencies, dependents, related constraints     |
| `query_graph`          | Search symbols, trace call chains                 |
| `semantic_search`      | Natural language search over your codebase        |
| `get_constraints`      | Active project constraints and rules              |
| `get_decisions`        | Architectural decisions and rationale             |
| `get_health`           | Code health: dead code, cycles, violations        |
| `propose_decision`     | AI writes back a decision it discovered           |
| `propose_constraint`   | AI writes back a constraint it inferred           |
| `record_instruction`   | Captures your corrections for DNA learning        |

## Language Support

**Tier 1 (bundled):** TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, Ruby, PHP

**Tier 2 (on-demand):** All other languages supported by Tree-sitter — downloaded and cached on first encounter.

## What Gets Created

```
~/.symbiote/                 # Global (your Developer DNA)
├── config.json
└── dna/
    ├── style/               # Coding patterns
    ├── preferences/         # Tech choices
    ├── anti-patterns/       # Things you never do
    └── decisions/           # How you make trade-offs

your-project/.brain/         # Per-project (the brain)
├── config.json
├── symbiote.db              # Code graph (gitignored)
└── intent/
    ├── overview.md          # Auto-generated project summary
    ├── decisions/           # Architectural decisions
    └── constraints/         # Project rules and constraints
```

## Privacy

Everything runs locally. No data leaves your machine. The optional "Ask Your Project" chat feature requires an LLM provider (OpenAI, Anthropic, or Ollama for fully-local).

## License

[MIT](LICENSE)
