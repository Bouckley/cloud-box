# 7. Dev setup (Windows laptop)

Develop inside WSL2 (Ubuntu) so the box runs on Linux like the Pi, with the
phone app pointed at your laptop over home Wi-Fi.

## Install

| Tool | Why | Notes |
|------|-----|-------|
| WSL2 + Ubuntu | Linux environment for the box | `wsl --install -d Ubuntu` |
| Docker Desktop | Containers and arm64 emulation | Enable the WSL2 backend |
| Go (latest stable) | Box server | Install inside WSL |
| Node LTS + pnpm | Web app, phone app, shared packages | `corepack enable` |
| VS Code + WSL extension | Editing | Open the repo with `code .` from WSL |
| Android Studio emulator | Phone app testing | Already on this machine |
| Expo dev client on your phone | Real-device testing | Same Wi-Fi as the laptop |
| Claude Code | AI pair programming | Skills in `.claude/skills/` |

**Tip:** keep the repo inside the WSL file system (for example
`~/code/cloud-box`) for speed, and use a path without spaces; `make` and some
build tools handle spaces badly. This planning folder can be copied there
when you start coding.

## Let your phone reach the box in WSL

Add to `%UserProfile%\.wslconfig`, then run `wsl --shutdown`:

```
[wsl2]
networkingMode=mirrored
```

Allow inbound port 8443 in Windows Firewall for private networks.

## Run it

```
make dev
```

This starts:
- `boxd --hal=sim --data=./.data` on https://localhost:8443
- the web app with hot reload on http://localhost:5173 (proxies API calls to the box)
- the simulator page on https://localhost:8443/dev/sim

Phone app:

```
cd app && npx expo start
```

Scan the box's pairing QR (shown in the web app's setup screen) from the app.

## Reset

```
make reset-dev   # wipes ./.data and starts fresh
```
