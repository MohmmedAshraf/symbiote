---
name: symbiote-init
description: Initialize Symbiote for the current project. Scans the codebase and extracts developer DNA (coding preferences), project constraints, and architectural decisions from the current context. Use when the developer runs /symbiote-init, asks to "initialize symbiote", "set up symbiote", or "scan my project". Requires symbiote-cli to be installed (npx symbiote-cli install).
---

# Symbiote Project Init

Initialize Symbiote for the current project — scan codebase and extract DNA + intent.

MCP server is already registered globally by `symbiote install`. This skill only scans and extracts.

## Process

1. Scan the codebase
2. Build extraction lists from context
3. Dispatch subagent to record everything
4. Print one-line summary

## Step 1: Scan

```bash
npx symbiote-cli scan
```

## Step 2: Build Extraction Lists

Read your context (CLAUDE.md, memories, rule files) and build three separate lists:

### DNA (coding preferences) → `record_instruction`

Extract how the developer writes code:

- Formatting (indentation, quotes, semicolons, line length)
- Language conventions (strict TypeScript, ESM, etc.)
- Code structure (early returns, composition, small functions)
- Anti-patterns (no `any`, no dead code, no comments)
- Testing preferences (TDD, isolation, framework)
- Workflow (conventional commits, small commits)

### Constraints (project rules) → `propose_constraint`

Extract rules the project enforces:

- "All mutations through server actions"
- "Validate external input with Zod at boundaries"
- "Tests must mirror src/ structure"

### Decisions (architectural choices) → `propose_decision`

Extract choices with rationale:

- "Chose Vitest over Jest for native ESM support"
- "Using DuckDB for graph storage — local-first, no external deps"
- "Switched to Drizzle for better type safety"

### What to Skip (applies to all three)

- File paths or directory descriptions
- Tool/product feature lists
- Author identity
- CLI commands or usage examples
- Anything describing WHAT the project IS rather than rules/choices/preferences

### Formatting Rules (applies to all three)

Each entry must be:

- One clear, grammatically correct sentence
- Self-contained — understandable without context
- Specific — not vague or overly broad

## Step 3: Dispatch Subagent

Launch a single Agent to record everything. Pass it all three lists.

**Agent prompt template:**

```
Record the following Symbiote entries using MCP tools. Call tools in parallel where possible.

**DNA entries** — use `record_instruction` with `isExplicit: true` for each:
1. [instruction]
2. [instruction]

**Constraints** — use `propose_constraint` for each with `scope: "global"` and a slugified `id`:
1. [constraint]
2. [constraint]

**Decisions** — use `propose_decision` for each with `scope: "global"` and a slugified `id`:
1. [decision]
2. [decision]

Return counts: { dna: N, constraints: N, decisions: N, failed: N }
```

## Step 4: Output

One line, nothing more:

```
Symbiote initialized — scanned 350 files, recorded 18 DNA entries, 5 constraints, 3 decisions.
```

Do NOT render tables, lists, or per-entry details.
