# 12. App UI

Designs and research live as shared artifacts:

- [App UI designs (12 screens)](https://claude.ai/artifact/2x7YjedtSmPE9Hb5uqZ1Ly)
- [UI research and plan](https://claude.ai/artifact/4xm47UnmYpwuzTBAuMHLRP)
- [Product spec and business model](https://claude.ai/artifact/WpmeVS9pAgPRuJScVV4JBS)
- [Hardware design concept](https://claude.ai/artifact/S2WtAEiZTP3YnBimVMfoVs)

## Navigation

Four fixed bottom tabs (Photos, Albums, Files, Box) with the safety banner on
every main screen. Simple mode shows Photos and Albums only, with larger text.

## Screens and the milestone that builds them

| Screen | Web (M2, shipped) | Phone (M3) |
|--------|----------|------------|
| Setup (button press, password, recovery key), Unlock, Forgot password, Connect a browser, recovery reset | ✓ | ✓ |
| Photos timeline (Days / Months / Years) + safety banner | ✓ | ✓ |
| Photo viewer | ✓ | ✓ |
| Safe delete sheet (web form: Move to Trash or Cancel) | ✓ | ✓ |
| Trash (restore, delete forever) | ✓ | ✓ |
| Free up phone space | | ✓ |
| Albums, Favourites, Videos; Add / Move to album | ✓ | ✓ |
| Files + upload sheet, folders, PDF viewer | ✓ | ✓ |
| Box: status, storage, copies, devices, add a device, change password, lock | ✓ | ✓ |
| Backup paused state | ✓ | ✓ |
| Simple mode | | ✓ |
| Cleanup assistant | M10 | M10 |

On the web the four tabs become a sidebar above 720 px. Deferred from the web
app (docs/plans/M2.md, scope ruling S7): live updates over `/v1/events` (the
app polls status every 30 s), photo search and the date scrubber, map and
people, edits, sharing and links (M7), "years of space left" and drive health
beyond plugged in or not (M4), streaming video playback, and a shorter
pairing code ([ADR 0009](decisions/0009-pairing-code-length.md)).

## Design tokens

| Token | Value |
|-------|-------|
| Safe / primary | #2E7D5B |
| Safe tint | #E6F1EB |
| Attention | #E0A33A on #FBF0D9, text #3B2800 |
| Danger | #B3261E |
| Text | #16181B, secondary #5C6066 |
| Font | Inter; body 17 pt (20 pt in simple mode) |
| Touch target | 48 pt minimum |
