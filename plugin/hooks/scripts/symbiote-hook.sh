#!/bin/bash
set -euo pipefail

ENDPOINT="$1"
PORT_FILE="${CLAUDE_PROJECT_DIR:-.}/.brain/port"

if [ ! -f "$PORT_FILE" ]; then
    exit 0
fi

PORT=$(cat "$PORT_FILE" 2>/dev/null)
if [ -z "$PORT" ]; then
    exit 0
fi

if [ -t 0 ]; then
    BODY='{}'
else
    BODY=$(cat)
fi

curl -s -m 10 -X POST "http://127.0.0.1:${PORT}/internal/hooks/${ENDPOINT}" \
    -H 'Content-Type: application/json' \
    -d "$BODY" 2>/dev/null || true
