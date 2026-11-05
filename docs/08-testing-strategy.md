# 8. Testing strategy

Prove each layer on the laptop, then on emulated arm64, then on the Pi.
Nothing moves to the next stage until its gate passes.

## Test types

| Type | Tools | Covers |
|------|-------|--------|
| Unit (Go) | `go test -race`, run twice: with and without `-tags sim` | Store, auth, blobs, library, status, trash, replica, jobs |
| Unit (TS) | Vitest | Crypto wrappers, API client, UI logic |
| Crypto vectors | `testdata/crypto-vectors.json` | Same inputs give the same outputs in Go and TS |
| Property-based | `rapid` (Go), fast-check (TS) | Encrypt/decrypt round-trips, sync never loses or duplicates items |
| API contract + zero knowledge | `pnpm --filter @cloudbox/api-client test:contract`: the generated TS client and `@cloudbox/crypto` against a freshly built `boxd` (live since M1) | Server matches `api/openapi.yaml`; an encrypted round trip works; no file the box writes holds plaintext, file names, the password or keys; logs hold no tokens or wrapped keys |
| Integration | `box/internal/server/integration_test.go` (`-tags sim`) over real HTTPS | Full upload → verify → replicate → status, pairing and revoke, Trash and purge, storage full |
| Fault injection | Sim API + `kill -9` | Disk full, backup drive unplugged, crash mid-upload, network drop, clock jump |
| Web end-to-end | Playwright + `@axe-core/playwright` (`make test-e2e`, live since M2; Chromium only until the M5 gate adds Firefox and WebKit) | Journeys 1, 3 (web form), 4 and 8, recovery reset, Photos, Albums, Files, Box and backup paused; WCAG 2.2 AA (axe), 200% text at 320 px and the CSP on every screen |
| Phone end-to-end | Maestro on the Android emulator | Pairing, auto backup, safe delete, free up space |
| arm64 | Docker + QEMU (`make test-arm64`) | Box tests on linux/arm64, without `-race` (too slow under emulation); `-race` on arm64 runs on the Pi in M5 |
| On-device soak | Real Pi, 72 h | Memory, temperature, upload of a full phone library, power cut |

## Must-pass journeys (end-to-end)

1. Set up the box, save the recovery key, pair a phone.
2. Back up 500 photos; every one reaches `replicated`; banner says safe.
3. Delete a photo "from this phone only"; it is still on the box. (Web form,
   M2: the delete sheet keeps the photo unless you choose Move to Trash.)
4. Delete "everywhere"; it is in Trash; restore it.
5. Free up phone space removes only `replicated` items.
6. Unplug the backup drive (sim): banner changes to a warning within 15 min.
7. Fill the main drive: uploads stop with a plain-language message; nothing is lost.
8. Forgot password: recover with the recovery key.
9. Revoke a lost phone; it can no longer sync.
10. Simple mode: every screen passes axe and works at 200% text size.

## Gates

| Stage | Where | Gate to move on |
|-------|-------|-----------------|
| 1 | Laptop, native Linux | All unit, integration and web E2E tests green |
| 2 | Laptop, Docker (amd64) | Same suite green inside the container |
| 3 | Laptop, Docker (arm64 emulated) | Box suite green on linux/arm64 |
| 4 | Pi on your desk | Journeys 1–9 pass from your phone; 72 h soak with no crash, steady memory |
| 5 | Pi in its printed case | SSD under about 45 °C and no CPU throttling during a full backup |
| 6 | Pilot at your mom's | Two weeks, no missed backups, she can do journeys 3 and 5 alone |

## CI

GitHub Actions on every push: lint, Go unit and integration tests (with and
without `-tags sim`), TS unit tests and crypto vectors, the contract test, and
web E2E (Playwright + axe, Chromium).
Nightly: arm64 suite and fault injection.
