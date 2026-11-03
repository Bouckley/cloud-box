#!/usr/bin/env bash
# Runs boxd with simulated hardware and, once web/ exists, the Vite dev
# server. Ctrl-C stops both. Paths are quoted: the repo may live in a
# directory with spaces.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data="${DATA_DIR:-$root/.data}"
pids=()

stop() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap stop INT TERM EXIT

go -C "$root/box" run -tags sim ./cmd/boxd --hal=sim --data="$data" &
pids+=($!)

if [[ -f "$root/web/package.json" ]]; then
  pnpm --dir "$root" --filter @cloudbox/web dev &
  pids+=($!)
  web_url="http://localhost:5173 (use this one in dev)"
else
  web_url="not built yet (web/ arrives in M2 Task 11)"
fi

cat <<MSG

  box:     https://localhost:8443  (self-signed: the browser warns once)
  web app: $web_url
  Ctrl-C stops both.

MSG

# Stop everything as soon as either process exits.
wait -n
