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

# Auto-start symbiote serve if not already running
port_file="$dir/.brain/port"
if [ -f "$port_file" ]; then
  port=$(cat "$port_file" | tr -d '[:space:]')
  # Check if the server is actually responding
  if ! curl -sf --max-time 1 "http://127.0.0.1:$port/internal/health" > /dev/null 2>&1; then
    # Port file exists but server is dead — clean up and restart
    rm -f "$port_file"
    nohup npx symbiote-cli serve --no-open > /dev/null 2>&1 &
    sleep 1
  fi
else
  # No port file — start the server
  nohup npx symbiote-cli serve --no-open > /dev/null 2>&1 &
  sleep 1
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

**IMPORTANT — When the developer corrects you or states a preference:**
You MUST call the `record_instruction` MCP tool to capture it in Symbiote's DNA system. This is how Symbiote learns across sessions and tools. Do this IN ADDITION to any other memory you save. Examples of when to call it:
- "don't use semicolons" → call `record_instruction` with instruction="Don't use semicolons"
- "prefer early returns" → call `record_instruction` with instruction="Prefer early returns over nested conditions"
- "no, use X instead of Y" → call `record_instruction` with the correction

**Workflow:**
1. Start with `get_developer_dna` to understand the developer's style
2. Use `get_context_for_file` before reading or editing any file
3. Use `get_constraints` to know what rules to follow
4. When the developer corrects you, ALWAYS call `record_instruction` with their feedback
EOF

exit 0
