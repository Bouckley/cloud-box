# 2. Repo structure

One repository (monorepo). Go code lives in `box/`; TypeScript code uses pnpm
workspaces.

```
cloud box/
├── CLAUDE.md                 Instructions for Claude Code
├── README.md
├── Makefile                  dev, test, build-pi, test-arm64
├── pnpm-workspace.yaml
├── .claude/
│   └── skills/               Project skills (see docs/11-skills.md)
├── api/
│   └── openapi.yaml          Source of truth for the box API
├── box/                      Go module: github.com/<you>/cloudbox/box
│   ├── cmd/
│   │   ├── boxd/             Main server binary
│   │   └── boxctl/           Admin CLI (status, export, reset-dev)
│   ├── internal/
│   │   ├── api/              HTTP handlers, middleware, auth
│   │   ├── auth/             Device keys, sessions, invites
│   │   ├── store/            SQLite access, migrations
│   │   ├── blobs/            Blob storage on disk, hashing, uploads
│   │   ├── replica/          Backup-copy job
│   │   ├── status/           Safety status calculation
│   │   ├── trash/            Trash and 30-day purge
│   │   ├── hal/              Hardware interfaces
│   │   │   ├── sim/          Laptop simulation + dev control endpoints
│   │   │   └── pi/           Raspberry Pi drivers (GPIO, I2C, smartctl)
│   │   ├── update/           Signed update agent (later)
│   │   └── config/
│   ├── migrations/           SQL migration files
│   └── web/                  Built web app embedded with go:embed
├── packages/
│   ├── crypto/               @cloudbox/crypto (libsodium)
│   └── api-client/           @cloudbox/api-client (generated)
├── web/                      React + Vite web app
├── app/                      Expo phone app
├── relay/                    Remote-access relay (later)
├── testdata/
│   └── crypto-vectors.json   Shared test vectors for Go and TS
├── deploy/
│   ├── systemd/              cloudbox.service
│   ├── pi/                   install.sh, first-boot setup
│   └── docker/               Dockerfile, compose.yaml (dev and arm64 tests)
├── e2e/                      Playwright tests (web) and Maestro flows (phone)
└── docs/
    └── decisions/            Architecture decision records
```

## Conventions

- Go: standard layout, `internal/` for everything not meant to be imported.
- TypeScript: strict mode, ESLint + Prettier, Vitest for unit tests.
- API: change `api/openapi.yaml` first, then regenerate `packages/api-client`.
- Commits: small and focused; each milestone in `docs/10-roadmap.md` on its own branch.
