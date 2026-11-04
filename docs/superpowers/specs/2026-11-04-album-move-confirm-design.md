# Album move confirmation (M2 Task 15)

Short design. Agreed in conversation on 2026-11-04; mockups in
`.superpowers/brainstorm/812938-1793818082/content/` (`move-a2-vs-b.html`
option B, `move-many.html`).

## Intent

A photo lives in one album (scope ruling S6), so `Add to album` moves it out of
the album it is in. Less confident users must see that before it happens: a
picture of the move, old album → new album, that makes plain the photo will
only be in the new one. It replaces the picker's one-line "It moves to the one
you choose" and the reviewer's fix 5 ("This photo is in {album} now").

- Goal: nobody moves a photo out of an album without seeing where it leaves
  and where it goes.
- Non-goal: changing S6 (one album per photo), or asking for photos that are
  only in Photos (nothing leaves, so they add straight away as now).
- Anti-goal: a step that reads like copying or deleting; a pop-up that grows
  taller than the screen.

## Approaches

1. **A second step inside the album picker** (chosen). After `Add`, the
   picker's content switches to the move view; `Cancel` returns to the list
   with the choice kept. One dialog, so Esc and focus behave like every other
   dialog; the Leaving / Moving to picture is its own small component.
2. A separate dialog opened after the picker closes. Rejected: Cancel back to
   the picker means reopening it and restoring state, and a close-then-open is
   confusing to see and to hear on a screen reader.
3. Callers (Photos, viewer) show the confirmation before moving. Rejected:
   the same logic twice, and Cancel cannot return to the picker.

## What it shows (option B, top to bottom)

- Heading: `Move this photo?` for one photo, `Move {n} photos?` for several,
  where n counts **only the photos leaving an album** (decided: keep).
- Line: `A photo lives in one album, so it will only be in the new one.`
  (several: `…so these will only be in the new one.`)
- **Leaving** box (grey, `paper` ground): a `Leaving` label, then one row per
  album the photos leave: faded cover (or album icon), album name,
  `{n} photos` count. At most three rows; the rest fold into one row
  `{k} more albums` with their photo count. Albums ordered by count, most
  first.
- Green down arrow.
- **Moving to** row (green tint, green border): cover (album icon for a new
  album), `Moving to` label, the album name (wraps between words), and for
  several photos the count going in (`{n} photos in all` when some come from
  Photos, else `{n} photos`).
- When some selected photos are only in Photos: `{k} photo(s) from Photos is
  added too.` under the box.
- Buttons at the end like other dialogs: `Cancel` (back to the picker list,
  choice and typed name kept) and `Move photo` / `Move photos` (primary green);
  busy `Moving…`; failure line as the picker's today. Success closes and shows
  the existing polite status `Added to {album}`.

## When it appears

Only when at least one selected photo is in another of the user's albums
(not the Photos root, not the target album itself). Otherwise `Add` adds
directly, as today.

## Build notes (decided)

- `pickerChoices` returns, in place of `elsewhere: number`, how many selected
  photos sit in each of the user's albums (`homes: { entry, count }[]`) and
  how many are only in Photos. When Add is pressed the picker drops the chosen
  target from `homes`; what is left is the Leaving list (empty → add directly).
- A presentational `MoveSummary` component (Leaving box, arrow, Moving to row)
  with its own Vitest tests; `AlbumPicker` holds a `step: 'choose' | 'confirm'`.
- Focus: entering confirm focuses `Cancel` (as the delete-album dialog does);
  returning focuses the chosen radio.
- New strings above join the plan's Copy table.
- Large text: rows wrap between words; covers hide under a narrow container
  (same rule as the reviewer's picker fix 1). No sideways scroll at 320 px,
  200% text.

## Left to the builder

Exact spacing and token use within DESIGN.md; the E2E journey gains the
confirm step (photo moved from Garden into a second album, Cancel returns to
the list, Move photo completes); axe on the confirm view; screenshots of one
photo, mixed selection and the folded "more albums" row at 1440, 390 and
320/200%.

## Also in this round

Reviewer fixes 1–4 and 6–8 as reported (picker/delete dialog layout at large
text, More-link icons, album grid columns, grey missing-album heading,
`{n} videos` count in Videos, surface brief seed).
