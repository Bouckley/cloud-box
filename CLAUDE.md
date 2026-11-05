# CLAUDE.md

Guidance for Claude Code when working in this repo.

## What this is

Cloud Box: a self-hosted, end-to-end encrypted photo and file store.
A Go server runs on a Raspberry Pi 5; a web app and an Expo phone app talk to it.
Read `README.md`, then the doc in `docs/` that matches the task.

## Non-negotiable rules

- **Zero knowledge.** The box stores ciphertext only. Never send plaintext
  file contents, file names, dates, locations or keys to the server. Never
  add server code that needs them. If a feature seems to need the server to
  read content (thumbnails, search, duplicate detection), do it on the client.
- **Never log secrets** (keys, passwords, recovery phrases, tokens, decrypted metadata).
- **Deletes go to Trash.** Permanent deletion only from Trash or the 30-day purge.
- **Safety status must be truthful.** An item counts as "safe" only when its
  blob is stored, hash-verified and present on the backup copy.
- **Hardware via the HAL only** (`box/internal/hal`). No GPIO, I2C or drive
  calls outside it. Every HAL interface has a `sim` implementation.
- **Accessibility:** WCAG 2.2 AA, 48 pt touch targets, labels on every control.

## Commands (once scaffolded)

```
make dev            # box (sim hardware) + web app with hot reload
make test           # all unit + integration tests
make test-e2e       # Playwright web tests (includes axe accessibility checks)
make web            # build the web app into box/web/dist (boxd embeds it)
make test-arm64     # run the box test suite under linux/arm64 emulation
make build-pi       # cross-compile the box for the Pi
cd app && npx expo start   # phone app
```

## How to work

- Write the test first for box logic and crypto (see `docs/08-testing-strategy.md`).
- Crypto changes must keep `testdata/crypto-vectors.json` passing in Go and TypeScript.
- API changes start in `api/openapi.yaml`; regenerate the TS client, then implement.
- Record significant choices as a new file in `docs/decisions/`.
- Before saying a task is done, run the relevant tests and show the output.
