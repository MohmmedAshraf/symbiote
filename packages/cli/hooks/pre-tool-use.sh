#!/bin/bash

INPUT=$(cat)

CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null) || exit 0
TOOL=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null) || exit 0
FILE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null) || exit 0

[ -z "$CWD" ] && exit 0

BRAIN_DIR="$CWD/.brain"
[ -d "$BRAIN_DIR" ] || exit 0

case "$TOOL" in
    Read|Edit|Write) ;;
    *) exit 0 ;;
esac

[ -z "$FILE" ] && exit 0

PORT_FILE="$BRAIN_DIR/port"
[ -f "$PORT_FILE" ] || exit 0
PORT=$(cat "$PORT_FILE" 2>/dev/null | tr -d '[:space:]')
[ -z "$PORT" ] && exit 0

ENCODED_FILE=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$FILE" 2>/dev/null) || exit 0
ENCODED_TOOL=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$TOOL" 2>/dev/null) || exit 0
ENCODED_ROOT=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$CWD" 2>/dev/null) || exit 0

RESULT=$(curl -s --max-time 3 "http://127.0.0.1:${PORT}/internal/hook-context?file=${ENCODED_FILE}&tool=${ENCODED_TOOL}&root=${ENCODED_ROOT}" 2>/dev/null) || exit 0

CONTEXT=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); c=d.get('additionalContext',''); print(c) if c else sys.exit(1)" 2>/dev/null) || exit 0

python3 -c "
import json,sys
print(json.dumps({
    'hookSpecificOutput': {
        'hookEventName': 'PreToolUse',
        'additionalContext': sys.argv[1]
    }
}))
" "$CONTEXT"
exit 0
