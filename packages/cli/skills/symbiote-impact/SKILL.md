---
name: symbiote-impact
description: Trace the blast radius of a code change using Symbiote's dependency graph. This skill should be used when the user asks to "analyze impact", "what will this change break", "show affected files", "check blast radius", "impact analysis", or "what depends on this".
---

# Symbiote Impact Analysis

Analyze the blast radius of a code change before making it — trace dependencies, find affected files, and surface risks.

## When to Use

- Before refactoring a widely-used function or module
- When renaming a symbol across the codebase
- To understand what tests might break from a change
- When planning a large-scale migration

## Process

### Step 1: Identify the Target

Determine what the user wants to change:

- A specific symbol (function, class, type) → use `get_impact`
- Uncommitted git changes → use `detect_changes`
- A file's full dependency tree → use `get_context_for_file`

### Step 2: Run Impact Analysis

**For a specific symbol:**

Use the `get_impact` MCP tool with the symbol name. It returns every affected file with confidence scores and traversal depth (max 3 levels).

**For uncommitted changes:**

Use the `detect_changes` MCP tool. It maps git diffs to modules and assigns risk levels.

**For a file's dependency tree:**

Use the `get_context_for_file` MCP tool to see all dependencies and dependents.

### Step 3: Trace Deeper (if needed)

For high-risk changes, go deeper:

- `trace_flow` — trace execution from an entry point through the call graph
- `trace_data` — trace data flow forward or backward from a symbol
- `find_implementations` — find all classes implementing an interface

### Step 4: Check for Safe Rename

If the change is a rename, use `rename_symbol` MCP tool to get a preview of all files that would change (dry-run, no writes).

### Step 5: Present Results

Summarize in this format:

```
## Impact Analysis: {symbol or change description}

**Direct dependents:** {count} files
**Transitive impact:** {count} files (depth {N})
**Risk level:** {low|medium|high}

### Affected Files
- `path/to/file.ts` — {why it's affected}
- `path/to/other.ts` — {why it's affected}

### Recommendations
- {what to test}
- {what to update}
- {risks to watch for}
```
