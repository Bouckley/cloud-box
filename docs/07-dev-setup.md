# 7. Dev setup

Develop on native Linux (Ubuntu 24.04 is the reference) so the box runs on the
same OS as the Pi. The phone app talks to your laptop over home Wi-Fi.
Windows users: see the [appendix](#appendix-windows-with-wsl2).

## Install

| Tool | Why | Install (Ubuntu 24.04) |
|------|-----|------------------------|
| make, gcc, jq | Makefile; gcc is needed by `go test -race`; jq checks the Go download | `sudo apt install build-essential jq` |
| Go (latest stable) | Box server | Official tarball to `/usr/local/go` (apt's version is too old) |
| Node LTS + pnpm | Web app, phone app, shared packages | nvm, then `npm i -g corepack && corepack enable pnpm` (Node 25+ no longer ships corepack) |
| Docker + buildx | Containers | Docker Engine from docs.docker.com; add yourself to the `docker` group |
| QEMU user emulation | `make test-arm64` | `sudo apt install qemu-user-static binfmt-support` |
| Python 3 + Playwright | `webapp-testing` skill | `python3 -m venv ~/.venvs/playwright`, then `pip install playwright` and `playwright install --with-deps chromium` |
| sqlite3 | Inspecting `./.data/db/box.sqlite` | `sudo apt install sqlite3` |
| Android Studio emulator | Phone app testing | Optional; a real phone with the Expo dev client also works |
| Claude Code | AI pair programming | Skills in `.claude/skills/` and plugins (see doc 11) |

Go install:

```
GOV=$(curl -s 'https://go.dev/VERSION?m=text' | head -1)
TAR="${GOV}.linux-amd64.tar.gz"
curl -LO "https://go.dev/dl/${TAR}"

# Check the download against Go's published SHA-256 before installing
SUM=$(curl -s 'https://go.dev/dl/?mode=json' | jq -r --arg f "$TAR" '.[].files[] | select(.filename==$f) | .sha256')
echo "${SUM}  ${TAR}" | sha256sum -c -   # must print: OK

sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf "$TAR" && rm "$TAR"
echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc
```

The Go version in `box/go.mod` is the minimum; CI and `make test-arm64` use it.

**TypeScript version:** the repo pins TypeScript 6.0.x because typescript-eslint
does not support TypeScript 7 yet. Bump both together when it does.

Check arm64 emulation works:

```
docker run --rm --platform linux/arm64 alpine uname -m   # prints aarch64
```

**Paths with spaces:** the Makefile and scripts quote every path, so the repo
can live anywhere. If a third-party tool breaks on a space, report it and use a
path without spaces as a workaround.

## Let your phone reach the box

The box listens on port 8443. Allow it from your home network only, not from
everywhere. Find your subnet with `ip -4 route | grep -v default` (for example
`192.168.1.0/24`), then:

```
sudo ufw allow from 192.168.1.0/24 to any port 8443 proto tcp comment 'Cloud Box dev'
sudo ufw status numbered
```

If ufw is inactive (`Status: inactive`), nothing is blocked and no rule is
needed; enabling it is still a good idea (`sudo ufw enable`, after allowing SSH
if you use it).

For the Expo dev server on a real phone, also allow Metro (port 8081) the same
way, or use `npx expo start --tunnel`.

Remove the rules when you no longer need them: `sudo ufw delete <number>`.

## Run it

```
make dev
```

This builds `boxd` with the Go build tag `sim` and starts it as
`boxd --hal=sim --data=./.data` on https://localhost:8443, and starts the web
app with hot reload on http://localhost:5173. Use the Vite address in dev: it
is a secure context with no certificate warning, and it proxies `/v1` and
`/dev` to the box.

http://localhost:5173/sim is the simulator page (dev builds only, never in the
production build): buttons for the dev API below, inside the app's frame.

The box serves the production build itself on https://localhost:8443 after
`make web` (the browser warns once about the self-signed certificate).

The `sim` tag adds a dev API for driving the simulated hardware. It has no
auth, is not in `api/openapi.yaml`, and a Pi build (`make build-pi`) never
contains it.

| Method | Path | Body | Does |
|--------|------|------|------|
| GET | `/dev/sim/state` | | Light, clock offset, plugged-in drives |
| POST | `/dev/sim/button` | `{"kind": "short" \| "long"}` | Press the power button |
| POST | `/dev/sim/drives/{main\|backup}` | `{"present"?: bool, "fillPercent"?: 0–100}` | Unplug or replug the backup drive; set how full a drive is |
| POST | `/dev/sim/clock/advance` | `{"seconds": n}` | Move the box's clock forward |
| POST | `/dev/sim/jobs/{name}` | | Run `replicate`, `purge`, `cleanup` or `light` now; returns its result |

For example: `curl -sk -X POST https://localhost:8443/dev/sim/jobs/replicate`.

Phone app:

```
cd app && npx expo start
```

Scan the box's pairing QR (shown in the web app's setup screen) from the app.

## Test

```
make lint
make test        # needs Go and Node: Go tests run twice (with and without
                 # -tags sim), then Vitest, then the contract test, which
                 # builds and starts a real boxd
make test-e2e    # Playwright + axe in Chromium: builds the web app and a
                 # sim boxd, then gives each test its own box
make test-arm64  # box tests on linux/arm64 under QEMU (Docker)
```

The first `make test-e2e` needs a browser:
`pnpm --filter @cloudbox/e2e exec playwright install chromium`. Traces,
videos and screenshots are off (pages show decrypted photos and recovery
words); a failure prints axe rule ids and element targets only.

## Reset

```
make reset-dev   # wipes ./.data and starts fresh
```

## Appendix: Windows with WSL2

Everything above runs inside WSL2 (`wsl --install -d Ubuntu`). Differences:

- Keep the repo inside the WSL file system (for example `~/code/cloud-box`), not
  under `/mnt/c`; it is much faster.
- Use Docker Desktop with the WSL2 backend instead of Docker Engine; it
  includes QEMU for arm64.
- Edit with VS Code and the WSL extension (`code .` from WSL).
- So the phone can reach the box, add this to `%UserProfile%\.wslconfig`, then
  run `wsl --shutdown`:

  ```
  [wsl2]
  networkingMode=mirrored
  ```

  and allow inbound port 8443 (and 8081 for Metro) in Windows Firewall for
  private networks. ufw inside WSL is not needed.
