---
version: 1
slug: "web-src-screens-photos-photos-tsx"
primary_target: "web/src/screens/photos/Photos.tsx"
related_targets: ["web/src/screens/photos/Timeline.tsx","web/src/screens/photos/Viewer.tsx","web/src/app/UploadPanel.tsx"]
---

# Surface brief: Photos timeline, upload panel and viewer

## Scope and mode

Operate. The Photos screen inside the shell (`/photos`), its upload panel, and
the photo viewer (`/photos/:itemId`). Select mode shows the selection bar;
Delete and Add to album are wired in Tasks 14 and 15. Behaviour and words come
from docs/plans/M2.md (Task 13 Interfaces, Copy table, Scope rulings S3, S6, S7).

## Audience, job, action

- Less confident, older users first, then households leaving paid clouds.
- Job: look at their photos, newest first, and add more from this computer.
  Trust comes from the banner above; tiles carry no backup badges.
- Actions: `Upload photos` (primary), `Select`, Days / Months / Years.

## States

- Empty: `No photos yet` with `Upload photos`.
- Loading: before the first sync, a quiet "Opening your photos" line, never
  an empty-state claim.
- Tiles: thumbnail decrypting (sunk tone, no spinner), thumbnail shown, no
  thumbnail (file tile with an icon and the type), video (play mark + duration),
  unreadable metadata (file tile, labelled "Photo that can't be read").
- Upload panel: `Uploading {i} of {n}` with a labelled `<progress>`;
  duplicates (`Already on your box`; `In Trash` + `Restore`), failures
  (message + `Try again`); stays until closed.
- Viewer: preview or original, video, over 2 GiB (`Download` only), Details
  (`Safe: on your box and the backup copy` only when replicated, else
  `On your box. Backup copy pending.`).
- Select mode: checkboxes on tiles, a bar with the count, `Delete`,
  `Add to album`, `Cancel`.

## Ranges

- 0 to 100,000+ photos; a day may hold 1 or 1,000 photos.
- Widths 320–2560 px, 200% text at 320 px with no sideways page scroll.
- Dates from 1900s scans to today; unknown taken dates fall back to the file's
  modified date.

## Layout intent

One row per day. Each group (day, month or year) is a heading with its count,
then one horizontal strip of tiles that scrolls sideways, with Previous and
Next buttons at the heading's end. Days uses large tiles, Months smaller,
Years a tight strip. The page scrolls vertically through groups; both
directions are virtualised.

## Direction contract

THESIS: The timeline is a stack of days you read top to bottom, each day one
strip you can browse sideways; it refuses the endless undifferentiated grid,
so a big library still reads as a list of moments with their counts.

OWN-WORLD: The established Cloud Box world: warm paper ground #f4f4f1, white
only where a surface earns it, ink type in Inter, green only for the primary
action and "safe". Tiles are photos with a 6 px radius on the ground, no
frames, no shadows, no badges.

STORY: The visitor sees the banner say their photos are safe, sees today at
the top, scans down the days by heading and count, and steps sideways into a
day with the arrow buttons or by tabbing tiles; opening a tile shows the
photo large, ←/→ walks the whole timeline.

FIRST VIEWPORT: Banner first; `Photos` h1 with the Days/Months/Years segmented
control, `Select` and green `Upload photos` on the same header row (wrapping
below 720 px). Below, three to four day groups: 19 px day heading and 15 px
count left, round 48 px Previous/Next buttons right, then a strip of 190 px
square tiles (Days), 128 px (Months), 88 px (Years), 6 px gaps.

FORM: One row per day, a dealt structure (position 6 of 6 on my list:
square grid, justified rows, day cards, margin dates, newest-day mosaic, one
row per day), user-locked. seed:63f764cc692d0ac1

Signature move: each strip's Previous/Next buttons page it by whole tiles and
disable at the ends, and a focused tile scrolls fully into view; the motion is
a 220 ms ease-out scroll, instant under reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
