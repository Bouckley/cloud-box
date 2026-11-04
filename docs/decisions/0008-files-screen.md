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
  in this browser. Photos show their preview. PDFs are drawn by pdf.js
  (`pdfjs-dist` 6.4.299, pinned exactly; loaded only when a PDF is opened) in
  Cloud Box's own frame: a toolbar (Previous page / Page n of N / Next page,
  Zoom out / size / Zoom in, Fit width) over the pages on a sunken ground.
  Only pages near the screen are drawn; each page's words are given to
  screen readers. This works the same on Android and iPhone, where the
  browsers' own readers can't be framed, so the CSP needs no `frame-src`.
  pdf.js's fonts, character maps, colour profiles and image decoders are
  served from `/pdfjs/` (about 3 MB in the box binary); its scripting sandbox
  is not shipped, so scripts in PDFs never run. Files over the in-memory
  limit, and PDFs pdf.js can't read, say so and offer Download. Any other file
  opens a details sheet (size, date, folder, a full-width Download, then
  Move to… and Delete as a list, × to close); nothing downloads by itself.
  A first version opened a new tab and downloaded other files on click; the
  owner found an installer downloading unasked and the tab easy to lose. A
  second used the browser's own reader in a frame; the owner asked for
  Cloud Box's own frame and controls. Word documents are not previewed
  (owner, PDF only): a faithful preview would need converting to PDF on a
  device, a later milestone. Download stays in the row menu.
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
