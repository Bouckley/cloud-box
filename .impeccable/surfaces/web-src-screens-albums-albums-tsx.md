---
version: 1
slug: "web-src-screens-albums-albums-tsx"
primary_target: "web/src/screens/albums/Albums.tsx"
related_targets: ["web/src/screens/albums/Album.tsx", "web/src/screens/albums/AlbumPicker.tsx", "web/src/screens/albums/NewAlbumDialog.tsx", "web/src/screens/albums/DeleteAlbumDialog.tsx"]
---

# Surface brief: Albums, an album, Favourites, Videos and the album picker

## Scope and mode

Operate. Albums (`/albums`), one album (`/albums/:id`), Favourites and Videos
(`/albums/favourites`, `/albums/videos`), the New album / Rename dialog, the
Delete album dialog, and `Add to album` from the viewer and the Photos select
bar (the album picker). Behaviour and words come from docs/plans/M2.md (Task 15
Interfaces, Scope ruling S6: one collection per item, so adding to an album
moves the photo there; Photos still shows every photo). The look comes from the
canvas `Albums.dc.html` (2x7YjedtSmPE9Hb5uqZ1Ly) inside the shipped DESIGN.md;
its "Shared with family" and "Screenshots" are not in M2.

## Audience, job, action

- Less confident, older users first: group photos into a few named albums
  (Family, Garden, Trips) and find them again; never lose a photo doing it.
- Albums job: see my albums at a glance (cover, name, how many), open one,
  make a new one; reach Favourites, Videos and Trash.
- Album job: look through it like Photos; rename it; delete it without losing
  its photos (keeping them is the default).
- Picker job: put the chosen photos in an album, or a new one, in one step,
  and say plainly when a photo leaves another album to go there.
- Actions: `New album` (the header's one primary action), `Rename`,
  `Delete album` (dark ink confirm, not red: no photo is deleted for good;
  kept photos return to Photos, trashed ones wait 30 days in Trash), `Add to
  album` → `Add`.

## States

- Albums: loading; no albums (`No albums yet` and one sentence); albums with
  covers; an album with no photos (plain cover with the album icon); a name
  that can't be read (`Album that can't be read`).
- Album: empty (`No photos in this album yet` and how to add some); photos;
  missing or deleted (`This album isn't here`, back to Albums); Rename busy and
  failure; Delete dialog with and without photos, busy, failure.
- Favourites / Videos: empty (one sentence each) or a timeline.
- Picker: no albums yet (New album chosen, name field ready); albums listed
  with a small cover and count; New album with a name; a photo already in
  another album (Add goes to a confirm step: `Move this photo?`, a grey
  Leaving box with one row per album and its count, a brand arrow, a green
  Moving to row; Cancel returns to the list — see
  docs/superpowers/specs/2026-11-04-album-move-confirm-design.md); busy (`Adding…`); failure; done
  (polite status `Added to {album}`).

## Ranges

- 0 to hundreds of albums; 0 to tens of thousands of photos in one; names from
  1 to 255 characters (wrap, never clip).
- Widths 320–2560 px, 200% text at 320 px with no sideways page scroll.

## Layout intent

Albums: the standard screen header (`Albums` h1, green `New album` with a
plus icon), then `My albums`: a grid of album cards, two columns on phones and
auto-filling at about 200 px wide on wider screens. Each card is one link:
a cover (the newest photo, 4:3, 14 px radius, `surface-sunk` underneath)
with the semibold name and `{n} photos` under it, no card chrome. Then `More`:
the Task 14 More links (Favourites, Videos, Trash · {n}).

Album, Favourites, Videos: a quiet `Albums` back link above the h1; the
album's count beside the title; `Rename` and `Delete album` in the header's
end; then the Photos timeline component with the Days / Months / Years control.

Dialogs: the Task 14 dialog. Picker: a list of radio rows (40 px cover, name,
count) plus `New album` with its name field, in a scrolling list when long.

## Direction contract

THESIS: Albums are a calm shelf of the user's own names over their photos;
every action on them keeps the photos safe.

OWN-WORLD: The established Cloud Box world: warm paper ground, white cards,
ink type in Inter, green only for safe and the one primary action, red only
for permanent deletion (none here).

STORY: The visitor opens Albums, sees their albums as covers with names and
counts, opens Garden and looks through it. In Photos they select a few and
choose Add to album, pick Garden, and read `Added to Garden`. Later they delete
the album; the dialog already says the photos stay, and they do.

FIRST VIEWPORT: Banner, `Albums` h1 with `New album`, the first row of album
covers, and on most screens the More links.

FORM: Code-led within the established world, following the canvas's album
grid; no new structure beyond cover cards and radio rows in a dialog.
seed:63f764cc692d0ac1 (the world's seed; code-led refinement, no concept round)

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict and DESIGN.md.
