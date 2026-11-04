# ADR 0007: Photos timeline becomes a wrapping grid with a date scrubber

Date: 2026-11-04 · Status: Accepted · Supersedes the layout part of ADR 0006

## Context

ADR 0006 chose one sideways row per day. With real libraries that layout
shows about 50 photos per screen, hides most of a busy day past the right
edge, and needs about 1,000 rows for three years of photos. The owner asked
for research into iCloud Photos, Google Photos and Immich (2026-11-04). All
three use a dense grid with a way to jump through time. Their users' main
complaints are photos hidden by curation or by layout changes, losing their
place, and scrubbers that land on wrong dates or stall on large libraries.

## Decision

**A wrapping grid.** Each group (day, month or year) is a heading with its
count, followed by rows of square tiles that fill the width.

- Tile sizes aim for 180 / 120 / 80 px on wide screens and 110 / 80 / 56 px
  at 720 px and below. There are at least 3 / 4 / 6 columns, and no tile is
  smaller than 48 px.
- The page is virtualised by row, not by group, so a day with thousands of
  photos never renders as one block (Immich #28861).
- Keyboard: the whole grid is one tab stop.
  - ← → follow reading order. ↑ ↓ keep the column.
  - Home and End go to the ends of the row. Ctrl+Home and Ctrl+End go to the
    ends of the library.
  - Page Up and Page Down move a screen at a time.
- Months and Years show every photo, only smaller. Nothing is curated.
- **Small groups share a row.** A group that fits in one row is placed beside
  the groups after it, each with its own heading above its own tiles.
  - Headings line up across the row (CSS subgrid).
  - A group one tile wide uses the short date, for example "Sat, Oct 31".
  - ↑ ↓ move to the nearest column in the next row.
- **Select circle.** On hover (mouse and trackpad only) each photo shows a
  circle over a soft shade. Clicking it starts Select with that photo.
  - It is not a tab stop, so the grid stays one tab stop. Select in the
    header does the same job from the keyboard.

**A date scrubber.** It appears once the timeline is longer than 2½ screens.

- On wide screens it is a column beside the grid, with year marks. On phones
  it is only a handle over the grid's right edge, which appears once you
  scroll into the photos.
- You can drag it or click the track.
- For keyboard users it is a slider named "Jump to a date". ↑ ↓ move by
  month, Page Up and Page Down by year, and Home and End go to either end.
  Its value says the month, for example "March 2024".
- Stops and marks come from the decrypted items in the browser, so they are
  exact and need no request to the box. The box still learns no dates.

## Consequences

- Square tiles crop photos. A justified layout that keeps each photo's shape
  is possible later, since metadata carries width and height. It would make
  ↑ ↓ less predictable.
- The scrubber's visibility is decided from the computed layout, not from
  measured heights. Its column narrows the grid, and deciding from measured
  heights caused a render loop.
