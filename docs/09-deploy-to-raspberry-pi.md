# 9. Deploy to Raspberry Pi

Same binary and layout as on the laptop, cross-compiled for arm64 and run as a
systemd service on Raspberry Pi OS Lite (64-bit).

## Build

```
make build-pi   # GOOS=linux GOARCH=arm64 CGO_ENABLED=0 → dist/boxd-linux-arm64
```

Use a pure-Go SQLite driver (`modernc.org/sqlite`) so no C cross-compiler is needed.
The web app is built first and embedded into the binary.

## Prepare the Pi

1. Flash Raspberry Pi OS Lite (64-bit) with Raspberry Pi Imager; set hostname
   `cloudbox`, enable SSH with your key, set Wi-Fi only if no Ethernet.
2. Format the main SSD ext4, mount at `/srv/cloudbox` by UUID in `/etc/fstab`
   with `nofail`. Same for the backup drive at `/srv/cloudbox-backup`.
3. Install `smartmontools` and `avahi-daemon` (gives `cloudbox.local`).
4. Keep the microSD for the system only.

## Install

`deploy/pi/install.sh` (run over SSH):
- creates a `cloudbox` system user that owns `/srv/cloudbox*`
- copies `boxd` to `/opt/cloudbox/`
- installs `deploy/systemd/cloudbox.service`
- enables the hardware watchdog
- starts the service and prints the setup URL

```
[Unit]
Description=Cloud Box
After=network-online.target local-fs.target
Wants=network-online.target

[Service]
User=cloudbox
ExecStart=/opt/cloudbox/boxd --hal=pi --data=/srv/cloudbox --backup=/srv/cloudbox-backup
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/cloudbox /srv/cloudbox-backup

[Install]
WantedBy=multi-user.target
```

`--backup` is added with the backup copy job in M4; until then `boxd` rejects
it, so leave it out of the unit when testing earlier builds.

The `pi` HAL needs GPIO and I2C access: add the `cloudbox` user to the `gpio`
and `i2c` groups.

## Updates (later milestone)

- Release = `boxd` + manifest signed with an offline Ed25519 key.
- Box downloads, verifies the signature, keeps the old binary, swaps, restarts.
- If the new version fails its health check within 2 minutes, roll back.

## Before handing it to your mom

- [ ] Full phone library backed up and every item `replicated`
- [ ] Backup drive copy has run at least once
- [ ] Recovery key printed and stored somewhere safe (not with the box)
- [ ] Your phone paired as helper, so you can check status
- [ ] Simple mode on, text size set to her preference
- [ ] Stage 5 thermal check passed in the closed case
