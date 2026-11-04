# ADR 0008: Files screen layout and rulings

Date: 2026-11-04 · Status: Accepted

## Context

M2 Task 16 builds Files (`/files`, `/files/:folderId`). The canvas shows a
desktop table with coloured type chips; the plan's Interfaces list a row
menu with Download, Rename, Move to… and Delete. Core can move files
(`Library.move`) but has no folder move. DESIGN.md keeps red for permanent
deletion only and green for safe or the one primary action.

## Decision

- **Layout by width (owner, 2026-11-04).** A table (Name, Modified, Size, ⋯)
  above 720 px; list rows with `Modified · Size` under the name at 720 px and
  below. No sideways scrolling.
- **Clicking a name (owner, revised 2026-11-04 after trying it).** Folders
  open. Photos and PDFs open inside Cloud Box (`/files/open/{id}`), decrypted
  in this browser: photos from their preview, PDFs in the browser's own reader
  in a frame from a blob URL. The CSP gains `frame-src blob:` for that, and
  only that: the page can frame blobs its own scripts made, and still nobody
  may frame the app (`frame-ancestors 'none'`). Where there is no PDF reader
  (`navigator.pdfViewerEnabled === false`, e.g. Android Chrome) or the file is
  over the in-memory limit, the viewer says so and offers Download. Any other
  file opens a details sheet (size, date, folder, Download, Move to…,
  Delete); nothing downloads by itself. A first version opened a new tab and
  downloaded other files on click; the owner found an installer downloading
  unasked and the tab (titled with a blob id) easy to lose. Download stays in
  the row menu.
- **Folders have no Move.** Their menu is Rename and Delete; Delete is only
  for an empty folder, otherwise the item reads `Folder isn't empty` with the
  reason. Moving folders waits for a core folder move.
- **Colour.** Type chips are neutral (no hue marks a category); the menu's
  Delete and the empty-folder confirm are ink, because Trash is reversible and
  an empty folder holds nothing.
- **Search** runs on decrypted names in the browser, over the current folder
  and every folder inside it; it never reaches the box.

## Consequences

A folder move, folder download (zip) and multi-select in Files are later
work. Files shares the upload queue and panel with Photos; uploads carry a
folder id.
