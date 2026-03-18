#!/bin/bash

INPUT=$(cat)

CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null) || exit 0
TOOL=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null) || exit 0
FILE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null) || exit 0

[ -z "$CWD" ] && exit 0

BRAIN_DIR="$CWD/.brain"
[ -d "$BRAIN_DIR" ] || exit 0

PORT_FILE="$BRAIN_DIR/port"
[ -f "$PORT_FILE" ] || exit 0
PORT=$(cat "$PORT_FILE" 2>/dev/null | tr -d '[:space:]')
[ -z "$PORT" ] || [ "$PORT" = "0" ] && exit 0

[ -z "$FILE" ] && exit 0

TIMESTAMP=$(($(date +%s) * 1000))

case "$TOOL" in
    Edit)   TYPE="file:edit" ;;
    Write)  TYPE="file:create" ;;
    Read)   TYPE="file:read" ;;
    *)      exit 0 ;;
esac

REL=$(python3 -c "import os.path,sys; print(os.path.relpath(sys.argv[1],sys.argv[2]))" "$FILE" "$CWD" 2>/dev/null) || exit 0

curl -s --max-time 1 -X POST \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"$TYPE\",\"timestamp\":$TIMESTAMP,\"data\":{\"filePath\":\"$REL\",\"toolName\":\"$TOOL\"}}" \
    "http://127.0.0.1:${PORT}/internal/events" >/dev/null 2>&1 &

exit 0
