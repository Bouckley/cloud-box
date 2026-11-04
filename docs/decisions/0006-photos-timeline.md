# ADR 0006: Photos timeline layout and keeping item states current

Date: 2026-11-03 · Status: Accepted

## Context

M2 Task 13 builds the web Photos timeline, uploads and the viewer. Two
choices outlast the task. First, the plan asked for a layout exploration
before building. Second, the viewer's safety line ("Safe: on your box and
the backup copy") depends on each item's state. The box derives that state
from its blobs and bumps the item's sync sequence when the backup copy is
recorded. But the web app only synced the library after its own actions, so
a photo copied overnight still read "Backup copy pending" until the next
unlock. That was truthful but stale, and the M3 phone app's "Free up space"
will depend on the same per-item state.

## Decision

**One row per day.** The owner chose this from three layouts on a decision
page on 2026-11-03. Each group (day, month or year) is a heading with its
count, then one horizontal strip of square tiles:

- Previous/Next buttons page each strip by whole tiles.
- Tile sizes are 190 / 128 / 88 px on wide screens and 140 / 104 / 72 px at
  720 px and below.
- Both directions are virtual (`@tanstack/react-virtual`): the page scrolls
  through groups and each strip scrolls sideways. A 10,000-photo library
  keeps under 300 tiles in the DOM.
- Keyboard: each strip is one tab stop. ← → Home End move within it. The tab
  stop's tile is always rendered, even when it is scrolled out of the
  virtual range.

**The status poll also syncs.** Every 30-second status poll (while the tab is
visible) is followed by an incremental `library.sync()`. Item states (stored,
verified, replicated) and photos added on other devices then reach the open
app within one poll. A sync is one collections request plus one items page
from the last cursor, which is cheap when nothing changed. Failures are
ignored, and the next poll tries again. `Library.sync()` already coalesces
overlapping calls.

**Decrypted thumbnails stay in memory.** They live as object URLs in one
cache per unlocked library:

- At most 6 decrypt at once.
- The 500 most recently used are kept, and older ones are revoked.
- Everything is revoked when the library goes away.

Nothing decrypted is written to browser storage (scope ruling S3).

## Consequences

- With many days, the strips cost one header row per day. Months and Years
  are the dense views. A date scrubber stays deferred (S7).
- Sideways strips hide photos past the edge. The count beside each heading
  says how many there are, and Previous/Next make paging possible without
  gestures.
- The phone app (M3) should sync on the same trigger so both clients show
  the same states.
