#!/bin/bash
set -euo pipefail

command -v npx > /dev/null 2>&1 || exit 0

npx -y symbiote-cli hook session-start
