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
- **Clicking a name (owner).** Folders open. Photos and PDFs the browser can
  show open in a new tab from a blob URL decrypted in this browser (the tab is
  opened on the click so it isn't blocked); everything else, and anything over
  the in-memory limit, downloads. Download stays in the row menu.
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
