# Album Move Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before `Add to album` moves photos out of another album, show a "Leaving → Moving to" confirm step inside the album picker; also land the design reviewer's fixes 1–4 and 6–8, and finish M2 Task 15.

**Architecture:** `pickerChoices` (web/src/app/albums.ts) reports which of the user's albums the selected photos sit in. `AlbumPicker` gains a `confirm` step that renders a new presentational `MoveSummary` (Leaving box, arrow, Moving to row) when any chosen photo would leave another album. CSS-only fixes for large text. All on the existing uncommitted Task 15 work on branch `m2-web-app`.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, Playwright + axe, plain CSS (`web/src/styles/base.css`, tokens in `tokens.css`).

**Spec:** `docs/superpowers/specs/2026-11-04-album-move-confirm-design.md` (mockups: `.superpowers/brainstorm/812938-1793818082/content/move-a2-vs-b.html` option B, `move-many.html`).

## Global Constraints

- Zero knowledge: everything is computed from the decrypted snapshot in the browser; no API change.
- WCAG 2.2 AA, 48 px targets, a label on every control; no sideways scroll at 320 px with 200% text.
- No token changes (DESIGN.md: changing a token needs the owner's approval). Use existing tokens.
- Exact copy (add these rows to the `## Copy` table in `docs/plans/M2.md`):
  - Heading: `Move this photo?` / `Move {n} photos?` — n = photos leaving an album only
  - Line: `A photo lives in one album, so it will only be in the new one.` / `A photo lives in one album, so these will only be in the new one.`
  - Labels: `Leaving`, `Moving to`
  - Leaving row detail: `1 photo` / `{n} photos`; fold row name `1 more album` / `{k} more albums`
  - Moving to detail (several photos only): `{n} photos in all` when some come from Photos, else `{n} photos`
  - From Photos line: `1 photo from Photos is added too.` / `{k} photos from Photos are added too.`
  - Buttons: `Cancel`, `Move photo` / `Move photos`; busy `Moving…`
  - Videos header count: `1 video` / `{n} videos`
- Albums are user albums only: `kind === 'album' && role === null && deletedAt === null` (as `albumList`).

## Review Focus

1. A photo already in the chosen album is in the selection → it is not "leaving" and not counted anywhere in the heading or Moving to count (test in Task 1).
2. An album whose name can't be read is a source → its Leaving row says `Album that can't be read`, never blank (test in Task 2).
3. Target is a brand-new album and a photo leaves Garden → confirm step shows the album icon and the typed name; `onAdd` gets `{ newName }` (test in Task 3).
4. The move fails after `Move photo` → the confirm step stays, shows the failure line, buttons re-enable, a second press retries (test in Task 3).
5. Exactly four source albums → all four rows show; the fold only starts at five (test in Task 2).

---

### Task 1: Where the selected photos live, and the Videos count

**Files:**
- Modify: `web/src/app/albums.ts` (`pickerChoices`, new `videoCountText`)
- Modify: `web/src/screens/albums/Album.tsx:50` (count by scope)
- Modify: `web/src/screens/photos/Photos.tsx` (`AddToAlbum` passes the new props)
- Test: `web/src/app/albums.test.ts`

**Interfaces:**
- Produces:
  - `export type AlbumHome = { entry: AlbumEntry; count: number }`
  - `pickerChoices(snapshot, ids): { albums: AlbumEntry[]; homes: AlbumHome[]; onlyInPhotos: number }` — `homes`: one per user album holding ≥1 selected photo, count = selected photos in it, sorted by count desc then by the `albumList` name order; `onlyInPhotos`: selected photos in the Photos root. `elsewhere` is removed.
  - `export const videoCountText = (n: number) => string` — `1 video` / `{n} videos` (toLocaleString like `countText`).
  - `AlbumPicker` props change (implemented in Task 3): `elsewhere` → `homes: AlbumHome[]`, `onlyInPhotos: number`.

- [ ] **Step 1: Write the failing tests** in `albums.test.ts`, replacing the `pickerChoices` test:
  - `'reports which albums the photos are in, most first'`: `pickerChoices(lib, ['g1','g2','f1','r1'])` → `homes.map(h => [h.entry.album.id, h.count])` equals `[['garden',2],['family',1]]`; `onlyInPhotos` is `1`; `albums` ids equal `['empty','family','garden','secret']`.
  - `'all in one album: that album is not offered'`: `['g1','g2']` → albums `['empty','family','secret']`, homes `[['garden',2]]`, onlyInPhotos `0`.
  - `'photos in a folder are neither leaving an album nor in Photos'`: `['d1']` → homes `[]`, onlyInPhotos `0`.
  - `'videoCountText'`: `0` → `'0 videos'`, `1` → `'1 video'`, `1200` → `'1,200 videos'`.
- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @cloudbox/web exec vitest run src/app/albums.test.ts` → FAIL.
- [ ] **Step 3: Implement** in `albums.ts`; build `homes` from `albumList(snapshot)` entries keyed by id. In `Album.tsx` the header count uses `videoCountText` when the scope is `videos`, else `countText`. Update `AddToAlbum` in `Photos.tsx` to pass `homes` and `onlyInPhotos` (it will type-error until Task 3; land Tasks 1–3 before running typecheck).
- [ ] **Step 4: Run to verify they pass** — same command → PASS.

### Task 2: `MoveSummary`

**Files:**
- Create: `web/src/screens/albums/MoveSummary.tsx`, `web/src/screens/albums/MoveSummary.test.tsx`
- Modify: `web/src/styles/base.css` (`.move` block)

**Interfaces:**
- Consumes: `AlbumHome`, `AlbumEntry`, `albumName`, `countText` (Task 1); `TileMedia` (`photos/Tile.tsx`), `AlbumsIcon`.
- Produces: `export function MoveSummary(p: { leaving: AlbumHome[]; target: { entry: AlbumEntry | null; name: string }; incoming: number; fromPhotos: number }): JSX.Element` — `entry: null` for a new album (album icon as cover). `incoming` = leaving total + fromPhotos. Renders, in order: a `section` labelled `Leaving` with a `Leaving` label and a list (`role="list"`) of rows; an `aria-hidden` down-arrow SVG; a `Moving to` row; and, when `fromPhotos > 0`, the From Photos line.

- [ ] **Step 1: Write the failing tests**:
  - `'one row per album, with its count'`: leaving Garden 3, Trips 2 → within `getByRole('region',{name:'Leaving'})` two `listitem`s with text `Garden3 photos` / `Trips2 photos` (use `toHaveTextContent` on each).
  - `'an unreadable album name still reads'`: entry with `name: null` → row text contains `Album that can't be read`.
  - `'four albums show; five fold the rest'`: 4 homes → 4 listitems; 5 homes (counts 5,4,3,2,1) → 4 listitems, the last with text `2 more albums3 photos`; 4 homes never show a fold row.
  - `'moving to shows the name and, for several, the count'`: incoming 6, fromPhotos 1 → region/row text contains `Moving to`, the album name, `6 photos in all`, and the dialog text contains `1 photo from Photos is added too.`; with fromPhotos 0 and incoming 5 → `5 photos`, no "from Photos" line; with incoming 1 → no count at all.
  - `'a new album shows its typed name'`: `target {entry:null,name:'Trips'}` → `Moving to` row contains `Trips`.
- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @cloudbox/web exec vitest run src/screens/albums/MoveSummary.test.tsx` → FAIL.
- [ ] **Step 3: Implement**. Fold rule: show all rows when ≤ 4 homes; else the first 3 plus one row (`+{k}` tile on `line` ground) summing the rest. Styles per spec option B: Leaving box on `paper` with 14px radius, faded (`opacity: .6`) 52px covers, label `13px/700 uppercase` in `ink-2`; arrow in `brand`; Moving to row on the brand tint with a 2px `brand` border; names `overflow-wrap: break-word`; covers hidden under `@container (max-width: 22rem)` (the container is the dialog form — share the rule with Task 4 fix 1).
- [ ] **Step 4: Run to verify they pass** → PASS.

### Task 3: Picker confirm step

**Files:**
- Modify: `web/src/screens/albums/AlbumPicker.tsx`, `web/src/screens/albums/AlbumPicker.test.tsx`
- Modify: `docs/plans/M2.md` (`## Copy` rows from Global Constraints)

**Interfaces:**
- Consumes: Task 1 props, Task 2 `MoveSummary`.
- Produces: `AlbumPickerProps` = `{ albums; count; homes: AlbumHome[]; onlyInPhotos: number; onAdd; onClose; returnFocus? }`. Internal `step: 'choose' | 'confirm'`.

- [ ] **Step 1: Write the failing tests** (replace the two "another album" tests; `open()` defaults `homes: [], onlyInPhotos: 2`):
  - `'nothing leaving: Add adds at once'`: existing "adds to the chosen album" still passes with no confirm.
  - `'photos leaving: Add asks first, then Move photo moves'`: `homes [{Family,1}]`, count 1, choose Garden, click `Add` → `onAdd` not called; `getByRole('heading',{name:'Move this photo?'})`; text contains `A photo lives in one album, so it will only be in the new one.`; `Cancel` has focus; click `Move photo` → `onAdd({id:'garden',name:'Garden'})`, then `onClose`.
  - `'the chosen album is not counted as leaving'`: homes `[{Garden,2},{Family,1}]`, count 3, choose Garden → heading `Move this photo?` and only a Family row.
  - `'several: heading counts only those leaving'`: homes Garden 3, Family 2, onlyInPhotos 1, count 6, choose New album, type `Trips`, Add → heading `Move 5 photos?`, `Move photos` button, `6 photos in all`; Move → `onAdd({newName:'Trips'})`.
  - `'Cancel goes back with the choice kept'`: after confirm, click `Cancel` → dialog `Add to album` still open, Garden radio checked and focused, `onClose` not called.
  - `'a failed move stays on the confirm step'`: onAdd rejects → alert `Couldn't add it to the album. Try again.` (existing string); heading `Move this photo?` still shown; `Move photo` enabled; a second click calls `onAdd` again.
  - `'busy says Moving…'`: onAdd pending → button text `Moving…`, both buttons disabled.
- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @cloudbox/web exec vitest run src/screens/albums/AlbumPicker.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** On submit in `choose`: validate the new name as today; compute `leaving = homes.filter(h => h.entry.album.id !== chosenId)`; if empty call `onAdd` as today, else go to `confirm`. In `confirm` pass the question as the `Dialog` `title` (it renders the prop, so the dialog's name and `h2` follow it). `Dialog` applies `initialFocus` only on mount, so focus `Cancel` in an effect when `step` becomes `confirm`; on Cancel focus the chosen radio (or the name field for New album). Remove the old one-line lede.
- [ ] **Step 4: Run to verify they pass** → PASS; then `pnpm --filter @cloudbox/web exec tsc --noEmit` → 0 errors (Photos.tsx from Task 1 now matches).
- [ ] **Step 5: Add the Copy rows** to `docs/plans/M2.md`.

### Task 4: Reviewer layout fixes and the E2E journey

**Files:**
- Modify: `web/src/styles/base.css`, `e2e/tests/albums.spec.ts`, `.impeccable/surfaces/web-src-screens-albums-albums-tsx.md`

- [ ] **Step 1: Extend `albums.spec.ts`** (fails first): after the existing Garden add, make a second album `Trips` from the picker with the first photo selected (it is in Garden) → confirm dialog named `Move this photo?` shows `Leaving` `Garden` and `Moving to` `Trips`; `Cancel` returns to `Add to album`; Add again → `Move photo` → status `Added to Trips`; Garden now `1 photo`. `expectAccessible` on the confirm step. Adjust the rest of the journey to the new counts.
- [ ] **Step 2: Run** `make test-e2e` → FAIL until Task 3 wiring is in, then PASS.
- [ ] **Step 3: CSS fixes** (reviewer report, verbatim intent): (1) `.choice { flex: none }`, `.choice__text { flex: 1 1 auto }`, `.choice__label { overflow-wrap: break-word }`, `.choices { container-type: inline-size }` + `@container (max-width: 22rem) { .choice__cover { display: none } }`, phone dialog `padding-inline: var(--space-4)`, `.choice` `padding-inline: var(--space-3)`; (2) covered by (1) for the delete dialog; (3) `.more-link > svg { flex: none }`; (4) album grid `repeat(auto-fill, minmax(min(100%, 9rem), 1fr))` replacing the phone two-column rule, `.album-card__name { overflow-wrap: break-word }`; (6) `.empty h1, .empty h2` take ink.
- [ ] **Step 4: Fix 8** — set the brief's FORM to `seed:63f764cc692d0ac1` and run `impeccable concept-seed --check-seed seed:63f764cc692d0ac1` with the plugin script; report its exit status.
- [ ] **Step 5: Run everything** — `make lint && make test && make test-e2e` → PASS.

### Task 5: Design review round 2, DESIGN.md, commit

- [ ] **Step 1: Recapture** with the scratchpad `shots15.mjs`, adding: confirm step for one photo (viewer), mixed selection (3 Garden, 2 Trips, 1 Photos), five-album fold; an empty album's plain cover on Albums; `Album that can't be read` (skip if not producible through the UI; say so). 1440, 390, 320/200%.
- [ ] **Step 2: `impeccable detect --json`** on changed `web/src` files → `[]`.
- [ ] **Step 3: Resume the finish reviewer** with the new captures and this spec; act on `fix` (one batch, recapture) at most twice, then ask the owner.
- [ ] **Step 4: Spawn `impeccable:impeccable-documenter`** to update `DESIGN.md` and `.impeccable/design.json` for Albums, the picker and the move step.
- [ ] **Step 5: Run everything** — `make lint && make test && make test-e2e` → PASS; show the output.
- [ ] **Step 6: Commit** (Task 15 Step 5):

```bash
git add web/ e2e/tests/albums.spec.ts docs/plans/M2.md docs/superpowers/ DESIGN.md .impeccable/design.json .impeccable/surfaces/web-src-screens-albums-albums-tsx.md
git commit -m "feat(web): albums, favourites and videos"
```

Then stop for the owner's manual check (plan row 15) before Task 16.
