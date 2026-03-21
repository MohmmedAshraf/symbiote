---
name: symbiote-scan
description: Trigger a full codebase rescan to update Symbiote's knowledge graph with latest changes. This skill should be used when the user asks to "rescan the project", "update the code graph", "rebuild symbiote index", "rescan codebase", or "refresh symbiote". Optionally regenerates embeddings for semantic search.
---

# Symbiote Rescan

Trigger a full codebase rescan to update the knowledge graph with latest file changes.

## When to Use

- After significant refactoring or restructuring
- When symbiote's context feels stale or out of date
- After pulling large changesets from remote
- When semantic search returns outdated results

## Process

### Step 1: Check Server Status

```bash
curl -s http://127.0.0.1:$(cat .brain/port)/internal/health 2>/dev/null || echo "not running"
```

If not running, start it after the scan completes.

### Step 2: Run the Scan

For a standard rescan (structure + symbols + call graph):

```bash
npx -y symbiote-cli scan
```

For a full rescan with embedding regeneration (slower, enables better semantic search):

```bash
npx -y symbiote-cli scan --embeddings
```

To force a clean rescan ignoring cached state:

```bash
npx -y symbiote-cli scan --force
```

### Step 3: Restart Server (if was running)

If the server was running before the scan, restart it to pick up the new graph:

```bash
npx -y symbiote-cli serve --no-open > /dev/null 2>&1 &
```

Wait for it:

```bash
sleep 3 && curl -s http://127.0.0.1:$(cat .brain/port)/internal/health
```

### Step 4: Verify

Use the `get_project_overview` MCP tool to confirm the updated stats (file count, node count, edge count).

## Output

One line:

```
Symbiote rescan complete — {N} files indexed, {N} nodes, {N} edges.
```
