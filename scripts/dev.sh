#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -r agent/requirements.txt
fi
export DRY_RUN="${DRY_RUN:-true}"
.venv/bin/uvicorn agent.main:app --host 127.0.0.1 --port 8787 --reload &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT
cd web
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8787 npm run dev
