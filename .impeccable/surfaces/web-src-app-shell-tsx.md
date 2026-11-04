---
version: 1
slug: "web-src-app-shell-tsx"
primary_target: "web/src/app/Shell.tsx"
related_targets: ["web/src/app/SafetyBanner.tsx","web/src/styles/tokens.css"]
---

# Surface brief: web app shell and safety banner

## Scope and mode

Operate. The frame every main web screen lives in (Photos, Albums, Files, Box):
navigation, the storage meter, the skip link, the `<main>` region and the
safety banner that leads it. Screens fill the main region in Tasks 12–17;
this brief covers only the frame and the banner. Light theme only in M2
(owner decision, 2026-11-03); tokens are structured so a dark set can be added.

## Audience, job, action

- Less confident, older users (the owner's mom) and households leaving paid
  clouds. On every screen their first question is "are my photos safe?", and
  the second is "where is the thing I want?".
- Job: know at a glance whether everything is safe, and move between the four
  areas without getting lost. Action: pick an area; if the banner is not
  green, follow it to Box (the whole banner links there, except on Box itself).

## States the frame must carry

- Banner (copy fixed by the M2 Copy table): safe (`Everything is safe` /
  on Photos `All {n} photos are safe`, with `Backup copy updated {time}`);
  copying (`{n} waiting for the backup copy`); backup missing (`Backup copy
  paused`); storage low (`Your box is almost full`); unreachable (`Can't reach
  your box`); and a quiet "checking" state before the first status arrives,
  which must never read as safe.
- Polite live region for safe/copying, assertive alert for paused, full,
  unreachable. Icon + words always, never colour alone.
- Nav: active area (aria-current), keyboard focus, hover. Box tab shows an
  "needs attention" marker (dot + accessible name) in attention states only
  (backup paused, almost full, unreachable); copying and checking show none.
- Storage meter: `{used} of {size} used` on the main drive; hidden when status
  is unknown or unreachable. No "years left" until M4.

## Ranges

- Widths 320–2560 CSS px; text at 200% with no sideways scroll at 320 px.
- Counts from 0 to 100,000+ photos; drive sizes from GB to tens of TB.
- Times: just now, minutes, hours, days ago, never.

## Layout intent

Above 720 px: a left sidebar on the page ground (product mark, four nav items
as rounded pills, storage card below), main column to the right. At or below
720 px: four fixed bottom tabs with icon over label, safe-area padding, main
scrolls above. One `<h1>` per screen, owned by the screen. The banner is the
first thing in `<main>`.

## Direction contract

THESIS: The frame is a calm appliance panel whose one job is to say, truthfully
and first, whether your photos are safe; it refuses the cloud-drive default of
a dense toolbar with status buried in a settings page.

OWN-WORLD: Warm off-white ground `#F4F4F1`, white rounded cards (radius 14–18),
deep ink `#16181B`, one green `#2E7D5B` that means "safe" and nothing
decorative, amber `#E0A33A` on `#FBF0D9` for attention, danger `#B3261E` only
for destruction. Inter throughout, body 17 px, bold short headings. Line icons,
2 px stroke, rounded joins, always beside a word.

STORY: The visitor sees the shield and the sentence first, believes it because
it names when the backup copy last ran, and either carries on browsing or
follows the banner to Box to fix what it says.

FIRST VIEWPORT: Desktop: 240–280 px sidebar left (mark and "Cloud Box" at top,
Photos/Albums/Files/Box pills, storage card), main column: banner strip full
width at top, then the screen's h1 and content. Phone: banner at top under the
h1 area, content, 4 bottom tabs fixed. Primary action of each screen sits in
its header row to the right of the h1.

FORM: The canvas's sidebar shell (Web.dc.html) and bottom tabs (Main.dc.html),
inherited, not re-derived: the plan pins the structure, so no concept roll ran.
Signature move: the safety banner, a shield-marked strip that changes material
with the box's truth (green tint when safe, a neutral surface strip while
copying, an amber bordered card that grows to hold the reason and what to do
in attention states), mirrored by the attention dot on the Box tab. seed: not
rolled: the plan pins this shell precisely, and new-work §3 says never to run
the script for a precisely specified narrow request.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Exact relative-time wording for `{time}` (proposal: `just now`, `5 min ago`,
  `at 2:00 AM`, `yesterday at 2:00 AM`, `on 3 Nov`).
- Whether the storage card shows the backup drive too (proposal: main only;
  Box screen shows both).
