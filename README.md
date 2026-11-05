# Cloud Box

A private cloud you own: a small box at home that stores photos and files,
encrypted on your devices before they leave, with no monthly fee.

This repo holds the plan and the software. Build and test everything on a
laptop first, then move it to a Raspberry Pi 5.

So far (M2): the box server and the web app run on a laptop with simulated
hardware. `make dev`, then open http://localhost:5173 to set up a box, back up
photos and files, and see whether they are safe. See
[Dev setup](docs/07-dev-setup.md).

## Read in this order

| # | Doc | What it covers |
|---|-----|----------------|
| 1 | [Architecture](docs/01-architecture.md) | The parts and how data flows between them |
| 2 | [Repo structure](docs/02-repo-structure.md) | Folder layout of the code |
| 3 | [Security and encryption](docs/03-security-and-encryption.md) | Keys, encryption, what the box can and can't see |
| 4 | [Box API](docs/04-box-api.md) | Endpoints the apps call |
| 5 | [Storage and data model](docs/05-storage-and-data-model.md) | Database tables and disk layout |
| 6 | [Hardware abstraction](docs/06-hardware-abstraction.md) | Simulating the Pi's hardware on a laptop |
| 7 | [Dev setup](docs/07-dev-setup.md) | Tools to install and how to run it locally |
| 8 | [Testing strategy](docs/08-testing-strategy.md) | Test types and the gates before hardware |
| 9 | [Deploy to Raspberry Pi](docs/09-deploy-to-raspberry-pi.md) | Moving from laptop to Pi |
| 10 | [Roadmap](docs/10-roadmap.md) | Milestones with exit criteria |
| 11 | [Skills](docs/11-skills.md) | Claude Code skills to install for this project |
| 12 | [App UI](docs/12-app-ui.md) | Screens and links to the designs |

Decisions are recorded in [docs/decisions](docs/decisions/).

## Stack at a glance

- **Box server:** Go, one binary, SQLite, runs on Linux arm64 (Pi) and amd64 (laptop)
- **Web app:** React + Vite + TypeScript, served by the box
- **Phone app:** Expo (React Native) + TypeScript
- **Shared code:** TypeScript packages for encryption, the API client and the
  client core (keys, sessions, sync, encrypted upload)
- **Encryption:** libsodium primitives on every platform

## Golden rules

1. The box never sees a photo, file name or key in plain form.
2. Nothing is deleted without going through Trash (30 days).
3. "Your photos are safe" is only shown when it is true: stored, verified and copied.
4. Hardware is only reached through interfaces, so everything runs on a laptop.
