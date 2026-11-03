# 10. Roadmap

Milestones in build order. The gift for your mom lands at M6; everything after
is the product.

| # | Milestone | Main work | Exit criteria |
|---|-----------|-----------|---------------|
| M0 | Foundations | Repo, Makefile, CI, OpenAPI skeleton, ADRs, crypto test vectors | CI green; vectors pass in Go and TS |
| M1 | Box core (laptop) | Store, blobs, resumable uploads, auth, sync, trash, status, sim HAL | Upload → replicated in Go integration tests |
| M2 | Web app | Setup + recovery key (and recovery-key device reset, ADR 0004), Photos, Albums, Files, Upload, Safe delete, Box screen | Journeys 1, 3, 4, 8 pass in Playwright with axe |
| M3 | Phone app | QR pairing, auto backup, timeline, safe delete, free up space, simple mode | Journeys 2, 3, 5, 10 pass in Maestro on the emulator |
| M4 | Box operations | Backup copy job, scrub, health warnings, backup-paused alerts, export to USB | Journeys 6, 7 pass; fault-injection suite green |
| M5 | Move to the Pi | arm64 build, install script, systemd, thermal checks | Gates 3–5 in the testing strategy |
| M6 | Mom pilot (gift) | Set up at home, helper role for you, two-week watch | Gate 6 |
| M7 | Family sharing | Invites, members, shared albums, share links, helper role | Shared album works across two phones; helper sees no photos |
| M8 | Remote access | Coordination server, hole punching, relay | Backup works from mobile data |
| M9 | Expansion modules | Stack connector, ATECC608 verification, multi-drive storage | Genuine module accepted, forged rejected |
| M10 | Cleanup assistant | On-device duplicate, screenshot, blurry detection | Groups shown; nothing deleted without a tap |
| M11 | Signed updates | Update agent, rollback, release pipeline | Bad update rolls back automatically |

## Rough size

M0–M6 is the core and the biggest chunk. Treat estimates as unknown until M1
is done; re-plan then with real numbers.
