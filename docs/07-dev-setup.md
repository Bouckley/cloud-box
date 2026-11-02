# 7. Dev setup

Develop on native Linux (Ubuntu 24.04 is the reference) so the box runs on the
same OS as the Pi. The phone app talks to your laptop over home Wi-Fi.
Windows users: see the [appendix](#appendix-windows-with-wsl2).

## Install

| Tool | Why | Install (Ubuntu 24.04) |
|------|-----|------------------------|
| make, gcc | Makefile; gcc is needed by `go test -race` | `sudo apt install build-essential` |
| Go (latest stable) | Box server | Official tarball to `/usr/local/go` (apt's version is too old) |
| Node LTS + pnpm | Web app, phone app, shared packages | nvm, then `npm i -g corepack && corepack enable pnpm` |
| Docker + buildx | Containers | Docker Engine from docs.docker.com; add yourself to the `docker` group |
| QEMU user emulation | `make test-arm64` | `sudo apt install qemu-user-static binfmt-support` |
| Python 3 + Playwright | `webapp-testing` skill | `python3 -m venv ~/.venvs/playwright`, then `pip install playwright` and `playwright install --with-deps chromium` |
| sqlite3 | Inspecting `./.data/db/box.sqlite` | `sudo apt install sqlite3` |
| Android Studio emulator | Phone app testing | Optional; a real phone with the Expo dev client also works |
| Claude Code | AI pair programming | Skills in `.claude/skills/` and plugins (see doc 11) |

Go install:

```
GOV=$(curl -s 'https://go.dev/VERSION?m=text' | head -1)
curl -LO "https://go.dev/dl/${GOV}.linux-amd64.tar.gz"
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf "${GOV}.linux-amd64.tar.gz"
echo 'export PATH=$PATH:/usr/local/go/bin:$HOME/go/bin' >> ~/.bashrc
```

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
