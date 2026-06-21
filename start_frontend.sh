#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/mini_saas_frontend"
pnpm dev -p 3000 > /tmp/frontend.log 2>&1 &
echo "Frontend started"