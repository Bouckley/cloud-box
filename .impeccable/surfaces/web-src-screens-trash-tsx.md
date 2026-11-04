---
version: 1
slug: "web-src-screens-trash-tsx"
primary_target: "web/src/screens/Trash.tsx"
related_targets: ["web/src/screens/DeleteSheet.tsx"]
---

# Surface brief: Delete sheet and Trash

## Scope and mode

Operate. The delete sheet (a native `<dialog>`, opened from the photo viewer
and from the Photos select bar) and the Trash screen (`/trash`, linked from
Albums as `Trash · {n}`). Behaviour and words come from docs/plans/M2.md
(Task 14 Interfaces, Copy table, Scope ruling S5).

## Audience, job, action

- Less confident, older users first. Their fear is losing a photo by mistake.
- Delete sheet job: say plainly that nothing is gone yet, and make the safe
  choice the easy one. Focus starts on `Cancel`; Esc cancels.
- Trash job: see what is waiting to be deleted and how long is left, get a
  photo back in one press, and delete for good only after a second, explicit
  confirmation.
- Actions: `Move to Trash` (dark ink fill, not red: owner decision
  2026-11-04, red stays for permanent deletion), `Cancel`; on Trash,
  `Restore`, `Delete forever` (red, confirmed), `Empty Trash` (red, confirmed,
  names the count).

## States

- Sheet: one photo (`Delete this photo?`), several (`Delete {n} photos?`), a
  file (`Delete this file?`); busy while moving (`Moving to Trash…`); failure
  (field-style error, stays until retried or cancelled).
- Trash: loading (quiet line), empty (`Trash is empty` and one sentence),
  rows (thumb or file tile, name or date, `{n} days left`, `Restore`,
  `Delete forever`), an item with 1 day or less left, restored (polite status
  `Restored {name}`, the row goes), confirm dialogs, failure.

## Ranges

- 0 to thousands of items in Trash; names from 1 to 255 characters.
- Widths 320–2560 px, 200% text at 320 px with no sideways page scroll.

## Layout intent

Sheet: a centred white card (18 px radius) floating over a dimmed page, the
only `shadow-raised` surface besides the select bar. Title, the reassurance
sentence, the one option described (`Move to Trash` · `You can restore it
from Trash for 30 days.`), then the buttons: `Cancel` first in focus order.

Trash: the standard screen header (`Trash` h1, `Empty Trash` at the end),
then a white card list of rows: 64 px thumb, name and days left, actions at
the row's end, wrapping under the text on phones.

## Direction contract

THESIS: Deleting is calm and reversible by default; only Trash can make it
permanent, and only after a second, plain question.

OWN-WORLD: The established Cloud Box world: warm paper ground, white cards,
ink type in Inter, green only for safe and the primary action, red only for
permanent deletion, no amber here.

STORY: The visitor presses Delete, reads that the photo stays safe on the box
until they choose, and either cancels (focus was already there) or moves it to
Trash. Later, in Trash, they see how many days are left, press Restore and
see it confirmed, or choose Delete forever and confirm it.

FIRST VIEWPORT: Sheet: title, one reassurance sentence, the described option,
two pill buttons. Trash: banner, `Trash` h1 with `Empty Trash`, the first
rows of the list.

FORM: Code-led within the established world; no new structure beyond a native
dialog and a list card. seed: none (code-led refinement; no concept round)

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict and DESIGN.md.
