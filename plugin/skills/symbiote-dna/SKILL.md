---
name: symbiote-dna
description: Manage Symbiote's Developer DNA — the learned coding preferences, style rules, and anti-patterns that persist across sessions. This skill should be used when the user asks to "show my coding preferences", "manage DNA", "update my coding style", "what are my coding rules", "switch DNA profile", "export DNA", "import DNA profile", or "share coding preferences".
---

# Symbiote Developer DNA

Manage developer coding preferences that Symbiote learns and enforces across sessions.

## What is Developer DNA

DNA entries are coding rules Symbiote tracks with confidence scores. They have:

- **rule** — the specific coding preference
- **reason** — why it matters
- **category** — formatting, patterns, architecture, workflow, testing, tooling, ai-collaboration
- **confidence** — 0.0 to 1.0 (auto-promoted as patterns are observed)
- **applies_to** — language/framework scope
- **source** — explicit (user-stated), correction (from feedback), observed (from code patterns)

## Commands

### View Current DNA

Use the `get_developer_dna` MCP tool. Filter by category:

```
get_developer_dna({ category: "formatting" })
get_developer_dna({ category: "patterns" })
get_developer_dna({})  // all entries
```

### Record a New Preference

Use the `record_instruction` MCP tool:

```
record_instruction({
    rule: "Always use early returns over nested if-else",
    reason: "Reduces cognitive load and keeps functions flat",
    category: "patterns",
    applies_to: ["typescript", "javascript"],
    source: "explicit"
})
```

### CLI Profile Management

```bash
npx -y symbiote-cli dna              # Show active profile summary
npx -y symbiote-cli dna list          # List all profiles
npx -y symbiote-cli dna switch        # Switch active profile
npx -y symbiote-cli dna export        # Export profile to .dna.json
npx -y symbiote-cli dna import        # Import a shared profile
npx -y symbiote-cli dna diff          # Compare two profiles
```

### Export and Share

Export the current profile for team sharing:

```bash
npx -y symbiote-cli dna export
```

This creates a `.dna.json` file that teammates can import:

```bash
npx -y symbiote-cli dna import path/to/.dna.json
```

### Compare Profiles

Diff two profiles to see divergence:

```bash
npx -y symbiote-cli dna diff
```

## Output

When showing DNA, format as a clean grouped list:

```
## Developer DNA — {profile name}

### Formatting ({count})
- Use 4-space indentation everywhere (confidence: 1.0)
- Single quotes for strings (confidence: 0.9)

### Patterns ({count})
- Prefer early returns over nesting (confidence: 1.0)
- const over let, never var (confidence: 0.8)

### Architecture ({count})
- ...
```
