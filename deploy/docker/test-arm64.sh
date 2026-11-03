#!/usr/bin/env bash
# Runs the box's Go tests on linux/arm64 under QEMU emulation (docs/08 gate 3).
# -race is left out: under emulation it is too slow; it runs natively on the Pi in M5.
# -tags sim includes the end-to-end test (box/internal/server/integration_test.go).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
go_version="$(awk '$1 == "go" { print $2; exit }' "$root/box/go.mod")"
image="golang:${go_version}"

echo "Running box tests on linux/arm64 in ${image} (QEMU emulation, no -race)"
docker run --rm --platform linux/arm64 \
  --volume "${root}:/src:ro" \
  --volume cloudbox-gomodcache:/go/pkg/mod \
  --workdir /src/box \
  "$image" \
  sh -c 'echo "arch: $(uname -m), $(go version)" && go test -count=1 -tags sim ./...'
