#!/bin/bash
# Symbiote SessionStart hook for Claude Code
# Fires on session startup. Stdout is injected into Claude's context.

dir="$PWD"
found=false
for i in 1 2 3 4 5; do
  if [ -d "$dir/.brain" ]; then
    found=true
    break
  fi
  parent="$(dirname "$dir")"
  [ "$parent" = "$dir" ] && break
  dir="$parent"
done

if [ "$found" = false ]; then
  exit 0
fi

cat << 'EOF'
## Symbiote — Project Brain Active

This codebase is indexed by Symbiote, providing a living knowledge graph with code structure, dependencies, impact analysis, and developer DNA.

**Before making changes, use these MCP tools:**
- `get_context_for_file` — Dependencies, dependents, constraints for any file (use BEFORE editing)
- `get_developer_dna` — The developer's coding style and preferences (use to match their conventions)
- `query_graph` — Search symbols, trace call chains, find dependents
- `semantic_search` — Natural language search over the codebase
- `get_health` — Dead code, circular deps, coupling hotspots, constraint violations
- `get_impact` — Blast radius analysis: what breaks if you change a symbol
- `detect_changes` — Git diff mapped to affected graph nodes
- `get_constraints` — Active project rules (enforce these)
- `get_decisions` — Architectural decisions with rationale

**After the developer corrects you:**
- `record_instruction` — Capture their correction so Symbiote learns from it

**Workflow:**
1. Start with `get_developer_dna` to understand the developer's style
2. Use `get_context_for_file` before reading or editing any file
3. Use `get_constraints` to know what rules to follow
4. If the developer corrects your output, call `record_instruction` with their feedback
EOF

exit 0
