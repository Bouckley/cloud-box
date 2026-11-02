# 2. Repo structure

One repository (monorepo). Go code lives in `box/`; TypeScript code uses pnpm
workspaces.

```
cloud-box/
├── CLAUDE.md                 Instructions for Claude Code
├── README.md
├── Makefile                  dev, test, test-e2e, test-arm64, build-pi, reset-dev, lint, generate
├── package.json              Root scripts: lint, typecheck, test
├── pnpm-workspace.yaml
├── tsconfig.base.json        Strict TS settings shared by every package
├── eslint.config.js
├── .github/workflows/ci.yml  Lint, Go race tests, Vitest, generated-client check
├── .claude/
│   ├── settings.json         Enabled plugins, attribution
│   └── skills/               Project skills (see docs/11-skills.md)
├── api/
│   └── openapi.yaml          Source of truth for the box API
├── box/                      Go module: github.com/Bouckley/cloud-box/box
│   ├── cmd/
│   │   ├── boxd/             Main server binary
│   │   └── boxctl/           Admin CLI (status, export, reset-dev)          [M1]
│   ├── internal/
│   │   ├── api/              HTTP handlers, middleware, auth
│   │   ├── boxcrypto/        Ed25519 verify + SHA-256 (the box's only crypto)
│   │   ├── config/           boxd flags
│   │   ├── devcert/          Self-signed TLS certificate apps pin
│   │   ├── server/           HTTPS listener, timeouts, graceful shutdown
│   │   ├── auth/             Device keys, sessions, invites                  [M1]
│   │   ├── store/            SQLite access, migrations                       [M1]
│   │   ├── blobs/            Blob storage on disk, hashing, uploads          [M1]
│   │   ├── replica/          Backup-copy job                                 [M4]
│   │   ├── status/           Safety status calculation                       [M1]
│   │   ├── trash/            Trash and 30-day purge                          [M1]
│   │   ├── hal/              Hardware interfaces                             [M1]
│   │   │   ├── sim/          Laptop simulation + dev control endpoints       [M1]
│   │   │   └── pi/           Raspberry Pi drivers (GPIO, I2C, smartctl)      [M5]
│   │   └── update/           Signed update agent                             [M11]
│   ├── migrations/           SQL migration files                             [M1]
│   └── web/                  Built web app embedded with go:embed            [M2]
├── packages/
│   ├── crypto/               @cloudbox/crypto (libsodium)
│   │   └── scripts/          gen-vectors.ts (run once; --force to regenerate)
│   └── api-client/           @cloudbox/api-client (generated)
├── web/                      React + Vite web app                            [M2]
├── app/                      Expo phone app                                  [M3]
├── relay/                    Remote-access relay                             [M8]
├── testdata/
│   └── crypto-vectors.json   Shared test vectors for Go and TS
├── deploy/
│   ├── docker/               test-arm64.sh (M0); Dockerfile, compose.yaml    [M5]
│   ├── systemd/              cloudbox.service                                [M5]
│   └── pi/                   install.sh, first-boot setup                    [M5]
├── e2e/                      Playwright tests (web) and Maestro flows (phone) [M2, M3]
└── docs/
    ├── decisions/            Architecture decision records
    └── plans/                One implementation plan per milestone
```

`[Mn]` marks folders that do not exist yet and the milestone that adds them.

## Conventions

- Go: standard layout, `internal/` for everything not meant to be imported.
- TypeScript: strict mode, ESLint + Prettier, Vitest for unit tests.
- API: change `api/openapi.yaml` first, then regenerate `packages/api-client`.
- Commits: small and focused; each milestone in `docs/10-roadmap.md` on its own branch.
