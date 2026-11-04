---
version: 1
slug: "web-src-screens-files-files-tsx"
primary_target: "web/src/screens/files/Files.tsx"
related_targets: ["web/src/screens/files/FileTable.tsx","web/src/screens/files/UploadSheet.tsx","web/src/screens/files/NewFolderDialog.tsx","web/src/screens/files/MovePicker.tsx"]
---

# Surface brief: Files, a folder, the upload sheet, the move picker and the row menu

## Scope and mode

Operate. Files (`/files`) and one folder (`/files/:folderId`), the row's
`More options for {name}` menu, `New folder` / `Rename` dialog, `Move to…`
picker, the `Upload` sheet, and the Task 14 delete sheet for files. Behaviour
and words come from docs/plans/M2.md (Task 16 Interfaces, Copy table, Scope
ruling S6: one collection per item, so Move to… moves the file). The look
comes from the canvas `Web.dc.html` (2x7YjedtSmPE9Hb5uqZ1Ly) inside the
shipped DESIGN.md; its search over photos, "Shared with" column and "years
left" are not in M2. Owner decisions (2026-11-04): a table on wide screens,
list rows on phones; clicking a photo or PDF opens it in a new browser tab,
any other file downloads; Download stays in the row menu for every file.

## Audience, job, action

- Less confident, older users first: keep important papers (insurance,
  passport scans, tax returns) safe, in a few named folders, and get one back
  when they need it. Households replacing Drive / OneDrive second.
- Files job: see what is in this folder (name, when it changed, how big), go
  into a folder and back out, find a file by name, open it, upload into the
  folder I am looking at.
- Row job: open, download, move or delete one file; rename or delete a folder.
- Actions: `Upload to {folder}` (the header's one primary action, green),
  `New folder`, `Sort`, `Search files`; per row: click name (folder opens;
  photo/PDF opens in a new tab; other files download) and the ⋯ menu.

## States

- Folder: loading (`Opening your files…`); empty Files root (`No files yet`
  and one sentence on Upload); empty folder; files and folders; a name that
  can't be read; a folder that isn't there (deleted elsewhere: back to Files).
- Search: typing filters this folder and its subfolders; results show where
  each one lives; nothing found (`No files called "{q}"`).
- Row: opening / downloading (busy line, polite), failure (one line, retry by
  clicking again), too big for this browser (download.ts's message).
- Menu: open, item disabled with reason (`Folder isn't empty`).
- Upload sheet: idle with `Saving to Files › {folder}`; Change opens the
  folder picker; files chosen → sheet closes and the Task 13 upload panel
  carries progress, duplicates and failures.
- Move picker: folder tree as radio rows, current folder disabled with
  `It's here now`; busy `Moving…`; failure; done status `Moved to {folder}`.
- Dialogs: New folder / Rename (name needed, busy, failure); delete file
  (Task 14 sheet, `Delete this file?`); delete empty folder (ink confirm).

## Ranges

- 0 to thousands of files in one folder; folders nested a few levels;
  names 1–255 characters (wrap, never clip; the table's Name column takes
  the slack); sizes 0 B to many GB; dates from decades ago to today.
- Widths 320–2560 px; 200% text at 320 px with no sideways page scroll.

## Layout intent

Header: the breadcrumb is the h1 (`Files` › … › current folder, 22 px/700,
earlier crumbs are ink-2 links, the last has `aria-current="page"`), with
`Upload to {folder}` (green, upload icon) at the end. Below it one tools row:
`Search files` (pill field with a magnifier, grows), `New folder` and the
`Sort` select (white pill buttons).

Wide (≥ 720 px): one white card (18 px radius) holding a table: Name (36 px
type chip: folder on safe-tint, PDF on danger-tint, DOC on a blue tint,
photos as a small thumbnail where one exists, else an IMG chip), Modified,
Size (folders show `{n} files`), and a 48 px ⋯ button. Uppercase column
heads in ink-2. Row min-height 56 px; whole name is the link/button.

Narrow (< 720 px): the same card as list rows: chip, name, then
`{Modified} · {Size}` in ink-2 under it, ⋯ at the end. No table, no sideways
scroll.

Menu: a small white popover under the ⋯ button (Download, Rename for
folders, Move to…, Delete in danger ink at the end, separated by a hairline).
Upload sheet and Move picker: the Task 14 dialog.

## Direction contract

THESIS: Files is a plain, trustworthy filing cabinet: every paper visible by
name, date and size, one obvious way to open it, nothing hidden off-screen.

OWN-WORLD: The established Cloud Box world: warm paper ground, white cards,
ink type in Inter, green only for safe and the one primary action
(Upload to {folder}), red only for permanent deletion and the Delete menu
item's ink.

STORY: The visitor opens Files, sees Taxes and Insurance, goes into Taxes,
uploads this year's return (the sheet says where it is saving), sees it
appear with its size, clicks it and reads it in a new tab. Later they move
it to Files and delete an old one; it goes to Trash.

FIRST VIEWPORT: Banner, breadcrumb h1 with `Upload to {folder}`, the tools
row, and the first rows of the table or list.

FORM: Code-led within the established world, following the canvas's Files
table; list rows under 720 px (owner decision); no concept round.
seed:63f764cc692d0ac1 (the world's seed; code-led refinement, no concept round)

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict and DESIGN.md.
