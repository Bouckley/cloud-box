---
version: 1
slug: "web-src-screens-box-box-tsx"
primary_target: "web/src/screens/box/Box.tsx"
related_targets: ["web/src/screens/box/Storage.tsx", "web/src/screens/box/Copies.tsx", "web/src/screens/box/Devices.tsx", "web/src/screens/box/AddDevice.tsx", "web/src/screens/box/ChangePassword.tsx", "web/src/app/qr.tsx", "web/src/app/SafetyBanner.tsx"]
---

# Surface brief: Box

## Scope and mode

Operate. `/box`: the one place for the box's health and this account's
settings. Canvas references: `Box.dc.html` (status card, Storage, Copies) and
`BackupStopped.dc.html` (the amber attention card). Behaviour and words come
from docs/plans/M2.md (Task 17 Interfaces, Copy table, Scope rulings): no
"Healthy" (the main drive is `Connected` until M4 checks drive health), no
"years of space left", no Free up phone space, Cleanup, Family or Settings
rows in M2.

## Audience, job, action

- Less confident, older users first, and the family helper. Job: answer "are
  my photos safe, and if not, what do I do?" at a glance, then see space,
  where the copies are, and which devices can open the box.
- Actions, in the order people need them: read the status; `Add a device`
  (code + QR); `Rename` this browser; `Revoke` another device (confirmed);
  `Change password`; `Lock`.

## States

- Status card: the safety banner's states, drawn large on Box (not a link):
  checking, safe (`Everything is safe` · `Backup copy updated {time}`),
  copying (`{n} waiting for the backup copy`), backup missing (amber card,
  `Backup copy paused`), almost full (amber), can't reach (amber).
- Storage: waiting for status; `{used} of {size} used`; a segmented bar
  (`role="img"`, numbers in its label) and legend Photos / Videos / Files
  (+ Other when the drive holds more than the library accounts for).
- Copies: Main drive `Connected`; Backup copy `Updated {time}` /
  `Not copied yet` / `Not connected` (amber icon + words, never colour alone).
- Devices: loading, list, one device (its Revoke disabled, reason shown),
  rename dialog, revoke dialog, failure lines.
- Add a device: before a code; code in groups of 4 + QR + `Valid until
  {time}` + `Make a new code`; failure.
- Change password dialog: two fields, too short, mismatch, busy, failure,
  done.

## Ranges

- Devices 1–20; names 1–255 characters (break anywhere). Drive 32 GB–20 TB.
  Library 0 to hundreds of thousands of items.
- Widths 320–2560 px; 200% text at 320 px with no sideways page scroll.

## Layout intent

The status card first, full width, larger than the strip other screens show
(it is Box's headline). Below it the sections sit in the existing auto-fit
grid of white cards (min 22 rem, 16 px gap): Storage and Copies pair on wide
screens, then Devices and Add a device. `Change password` and `Lock` are
quiet buttons in the header row beside the `h1`. Flat cards, hairline-divided
rows, 48 px targets. Green only for safe/primary and the storage meter fill
(approved exception); attention amber only for the backup-missing row.
