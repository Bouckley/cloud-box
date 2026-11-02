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

| Screen | Web (M2) | Phone (M3) |
|--------|----------|------------|
| Photos timeline + safety banner | ✓ | ✓ |
| Photo viewer | ✓ | ✓ |
| Safe delete sheet | ✓ | ✓ |
| Free up phone space | | ✓ |
| Albums | ✓ | ✓ |
| Files + upload sheet | ✓ | ✓ |
| Box: status, storage, copies | ✓ | ✓ |
| Backup paused state | ✓ | ✓ |
| Simple mode | | ✓ |
| Cleanup assistant | M10 | M10 |

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
