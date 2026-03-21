---
name: symbiote-init
description: Initialize Symbiote for the current project. Scans the codebase and extracts developer DNA (coding preferences), project constraints, and architectural decisions from the current context. Use when the developer runs /symbiote-init, asks to "initialize symbiote", "set up symbiote", or "scan my project". Requires symbiote-cli to be installed (npx symbiote-cli install).
---

# Symbiote Project Init

Initialize Symbiote for the current project — scan codebase and extract DNA + intent.

MCP server is already registered globally by `symbiote install`. This skill only scans and extracts.

## Process

1. Scan the codebase and start the server
2. Write project overview
3. Scan ALL projects for developer identity
4. Build complete DNA entries, constraints, and decisions
5. Dispatch subagent with pre-built entries
6. Print one-line summary

## Step 1: Scan and Start Server

Run these as SEPARATE bash commands:

```bash
npx symbiote-cli scan
```

Then start the server:

```bash
npx symbiote-cli serve --no-open > /dev/null 2>&1 &
```

Then wait and verify:

```bash
sleep 3 && curl -s http://127.0.0.1:$(cat .brain/port)/internal/health
```

IMPORTANT: Do NOT combine scan and serve into one command. The scan must finish and release the DB lock before the server starts.

## Step 2: Write Project Overview

Write `.brain/intent/overview.md` — a concise project summary that gives AI tools instant context.

Read the codebase context (CLAUDE.md, package.json, top-level structure, scan results) and write a markdown file with this exact structure:

```markdown
# {Project Name}

{One sentence: what this project does and who it's for.}

## Tech Stack

- {Language/runtime} ({key detail})
- {Framework} ({purpose})
- {Database/storage} ({why chosen})
- {Other significant deps}

## Architecture

- `{top-level-dir}/` — {what it contains}
- `{top-level-dir}/` — {what it contains}

## Key Patterns

- {How data flows}
- {How modules connect}

## Entry Points

- `{file}` — {what it does}
```

Rules: keep it under 40 lines, no frontmatter, be specific to THIS project.

## Step 3: Scan ALL Projects for Developer Identity

Read the developer's full coding identity across every project:

1. `~/.claude/CLAUDE.md` — global instructions
2. Every CLAUDE.md in `~/.claude/projects/*/` — all project instructions
3. Every `.md` file in `~/.claude/projects/*/memory/` — all memories
4. `./CLAUDE.md` — current project

Read ALL of these. Do not skip any.

**Also extract the developer's identity** from the global CLAUDE.md:

- Name (look for "Name:", "Author:", or similar)
- Email
- GitHub handle
- Website/URL

## Step 4: Build Complete DNA Entries

From everything in Step 3, build three COMPLETE lists. Every entry must be fully formed — do NOT leave fields empty.

### DNA entries

Build each entry as a COMPLETE JSON object with ALL fields filled:

```json
{
    "rule": "Use 4-space indentation everywhere, never tabs",
    "reason": "Consistency across polyglot stack eliminates context-switching friction and keeps diffs uniform",
    "category": "formatting",
    "applies_to": ["typescript", "javascript", "json", "php"],
    "not_for": ["go"],
    "source": "explicit"
}
```

**EVERY field is required:**

- `rule` — one specific sentence, self-contained
- `reason` — WHY this matters. NEVER leave empty. "Comments rot faster than code; good names eliminate narration" is good. Generic "for consistency" is not acceptable.
- `category` — use organic categories: `formatting`, `patterns`, `architecture`, `workflow`, `testing`, `tooling`, `ai-collaboration`. Not the old fixed categories.
- `applies_to` — list of languages/frameworks in lowercase. Empty `[]` means universal.
- `not_for` — exclusions where a rule doesn't apply (e.g., Go uses tabs not spaces). Omit if no exclusions.
- `source` — always `"explicit"` for init

**Categories to cover** (verify you have entries for each):

- **formatting** — indentation, quotes, semicolons, line length, file naming (kebab-case?)
- **patterns** — early returns, composition over inheritance, small functions, naming, error handling, type strictness
- **architecture** — project structure, separation of concerns, where logic lives, module boundaries, monorepo patterns
- **workflow** — commit style, no co-authored-by, never push without asking, no destructive DB ops, challenge plans
- **testing** — framework per language (Vitest, Pest), TDD, test structure, isolation
- **tooling** — framework choices per stack: Laravel+Inertia for PHP, Next.js for TS, Supabase, Stripe, Tailwind, shadcn
- **ai-collaboration** — concise responses, no trailing summaries, research before changing, no docs unless asked

**Confidence scoring:**

- Found in 3+ project CLAUDE.md files → `1.0`
- Found in 1-2 projects → `0.7`
- Current project only → `0.5`

**Completeness checklist before proceeding:**

- [ ] Formatting rules (indentation, quotes, line length, file naming)
- [ ] Code patterns (early returns, composition, function size, type strictness)
- [ ] Architecture (project structure, separation of concerns, module boundaries)
- [ ] Workflow (commits, pushing, destructive operations, AI collaboration style)
- [ ] Testing (framework per language, TDD, test structure)
- [ ] Tooling (framework choices per language/stack)
- [ ] AI collaboration (response style, autonomy level)
- [ ] Language-specific entries with proper `applies_to` scoping
- [ ] `not_for` exclusions where rules don't apply to certain languages
- [ ] Every `reason` field is filled with a specific WHY

### Constraints (project rules)

For THIS project only. Use `propose_constraint` MCP tool.

### Decisions (architectural choices)

For THIS project only. Use `propose_decision` MCP tool.

### What to Skip

- File paths or directory descriptions
- Tool/product feature lists
- Author identity (captured separately)
- CLI commands or usage examples

## Step 5: Dispatch Subagent

Launch a single Agent to record everything. Pass the COMPLETE pre-built entries — do NOT ask the subagent to figure out fields.

**Critical: also pass the developer identity** so the subagent can update the profile metadata.

**Agent prompt template:**

```
Record the following Symbiote entries using MCP tools. Call tools in parallel where possible.

## Developer Identity

After recording all entries, the profile at ~/.symbiote/profiles/personal.json needs its metadata updated.
Read the file, update the "profile" block with:
- name: {developer name}
- handle: {github handle}
- bio: {one-liner about their coding identity, synthesized from the DNA entries}
Then write the file back.

## DNA entries

Use `record_instruction` for each. Pass the EXACT JSON shown — do not modify or simplify the fields.

1. {"rule": "...", "reason": "...", "category": "...", "applies_to": [...], "not_for": [...], "source": "explicit"}
2. {"rule": "...", "reason": "...", "category": "...", "applies_to": [...], "source": "explicit"}
...

## Constraints

Use `propose_constraint` for each with `scope: "global"` and a slugified `id`:
1. [constraint]
2. [constraint]

## Decisions

Use `propose_decision` for each with `scope: "global"` and a slugified `id`:
1. [decision]
2. [decision]

Return counts: { dna: N, constraints: N, decisions: N, failed: N }
```

**IMPORTANT:** List every DNA entry as a complete JSON object in the subagent prompt. The subagent just passes them through to `record_instruction` — it does NOT need to think about what fields to include.

## Step 6: Output

One line, nothing more:

```
Symbiote initialized — scanned 350 files, recorded 48 DNA entries, 5 constraints, 3 decisions.
```

Do NOT render tables, lists, or per-entry details.
