# ADR 0001: Tech stack

Date: 2026-11-02 · Status: Proposed

## Decision

| Part | Choice |
|------|--------|
| Box server | Go, single static binary, `modernc.org/sqlite` |
| Web app | React + Vite + TypeScript |
| Phone app | Expo (React Native) + TypeScript |
| Encryption | libsodium on all platforms |
| Repo | Monorepo; pnpm workspaces for TypeScript |

## Why

- Go cross-compiles to the Pi's arm64 with one command and no C toolchain,
  and its memory use suits a 4 GB Pi.
- React and Expo share TypeScript, so the crypto and API client are written once.
- libsodium has mature bindings for browsers, React Native and Go-compatible
  primitives, and is what similar end-to-end encrypted photo apps use.
- Expo is already set up on this laptop.

## Alternatives considered

- **Rust core shared by all apps:** strongest single crypto implementation,
  but a much steeper build setup for mobile. Revisit for v2.
- **Flutter app:** good, but can't share code with a React web app.
- **Python server:** fast to write, but heavier on the Pi and harder to ship as one file.

## Consequences

- iOS background photo upload is limited by Apple; the app backs up when
  opened and during allowed background windows. Test early in M3.
- Thumbnails, search and duplicate detection run on clients (zero knowledge).
