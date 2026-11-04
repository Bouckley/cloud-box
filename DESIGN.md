---
name: Cloud Box
description: A calm appliance panel that says, truthfully and first, whether your photos are safe.
colors:
  ground: "#f4f4f1"
  surface: "#ffffff"
  surface-sunk: "#f2f2ef"
  line: "#e4e4e0"
  line-strong: "#d5d6d2"
  track: "#e2e2de"
  ink: "#16181b"
  ink-2: "#5c6066"
  ink-3: "#4a4e54"
  safe: "#2e7d5b"
  safe-strong: "#1f5a41"
  safe-tint: "#e6f1eb"
  safe-ink: "#1f4a38"
  safe-ink-2: "#3f5f51"
  attention: "#e0a33a"
  attention-tint: "#fbf0d9"
  attention-ink: "#3b2800"
  attention-ink-2: "#4a3200"
  attention-strong: "#8a5a00"
  danger: "#b3261e"
  danger-tint: "#fbe9e7"
  focus: "#1f5a41"
typography:
  headline:
    fontFamily: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  label:
    fontFamily: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
  label-xs:
    fontFamily: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.2
  code:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "14": "56px"
components:
  button-primary:
    backgroundColor: "{colors.safe}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.safe-strong}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "48px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-sunk}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "48px"
  button-ink-hover:
    backgroundColor: "{colors.ink-3}"
  button-quiet-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "48px"
  button-quiet-danger-hover:
    backgroundColor: "{colors.surface-sunk}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "48px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  storage-card:
    backgroundColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "16px"
  nav-item:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "48px"
  nav-item-hover:
    backgroundColor: "{colors.surface-sunk}"
  nav-item-active:
    backgroundColor: "{colors.safe-tint}"
    textColor: "{colors.safe-strong}"
  tab:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label-xs}"
    height: "72px"
  tab-active:
    textColor: "{colors.safe-strong}"
  banner-safe:
    backgroundColor: "{colors.safe-tint}"
    textColor: "{colors.safe-ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  banner-copying:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  banner-checking:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  banner-attention:
    backgroundColor: "{colors.attention-tint}"
    textColor: "{colors.attention-ink-2}"
    rounded: "{rounded.lg}"
    padding: "16px"
  field-hint:
    textColor: "{colors.ink-2}"
  field-error:
    textColor: "{colors.danger}"
    typography: "{typography.label}"
  notice:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  step-label:
    textColor: "{colors.ink-2}"
  recovery-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  device-badge:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
    typography: "{typography.label-xs}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
  pair-panel:
    backgroundColor: "{colors.surface-sunk}"
    rounded: "{rounded.md}"
    padding: "16px"
  pair-code:
    textColor: "{colors.ink}"
    typography: "{typography.code}"
  segmented:
    backgroundColor: "{colors.track}"
    textColor: "{colors.ink-3}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "48px"
  segmented-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  select-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "8px 8px 8px 20px"
  tile:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.xs}"
  tile-checked:
    backgroundColor: "{colors.line}"
  scrubber-grip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    size: "36px"
  scrubber-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
  upload-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  viewer-details:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  viewer-safe-line:
    textColor: "{colors.safe-ink}"
  viewer-pending-line:
    textColor: "{colors.ink-3}"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  sheet-option:
    backgroundColor: "{colors.surface-sunk}"
    rounded: "{rounded.md}"
    padding: "16px"
  trash-thumb:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.xs}"
    size: "64px"
  more-link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "48px"
  more-link-hover:
    backgroundColor: "{colors.surface-sunk}"
  album-cover:
    backgroundColor: "{colors.track}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
  back-link:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    height: "48px"
  choice:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px"
    height: "48px"
  choice-hover:
    backgroundColor: "{colors.surface-sunk}"
  choice-cover:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.xs}"
    size: "40px"
  move-leaving:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "8px 12px 12px"
  move-to:
    backgroundColor: "{colors.safe-tint}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px"
  move-cover:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    size: "52px"
  crumb-link:
    textColor: "{colors.ink-2}"
    height: "48px"
  crumb-link-hover:
    textColor: "{colors.ink}"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 16px 0 44px"
    height: "48px"
  icon-button:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    size: "48px"
  icon-button-hover:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
  file-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  file-table-head:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "12px 16px"
  file-row-meta:
    textColor: "{colors.ink-3}"
    typography: "{typography.body}"
  file-chip:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.sm}"
    size: "40px"
  file-chip-folder:
    textColor: "{colors.ink}"
  file-chip-photo:
    rounded: "{rounded.xs}"
    size: "40px"
  row-menu:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 0"
  row-menu-item:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "0 16px"
    height: "48px"
  row-menu-item-hover:
    backgroundColor: "{colors.surface-sunk}"
  row-menu-item-disabled:
    textColor: "{colors.ink-2}"
  upload-to:
    backgroundColor: "{colors.surface-sunk}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Cloud Box

Source of truth: `web/src/styles/tokens.css` (values) and `web/src/styles/base.css` (components). Components use token names, never raw values. **Changing a token value needs the owner's approval and an update to this file.** Light theme only in M2 (owner decision, 2026-11-03); a dark set may later redefine the same names under one selector.

## Overview

**Creative North Star: "The Calm Appliance Panel"**

The frame exists to answer one question first and truthfully: are my photos safe? Everything else is quiet: a warm off-white ground, white rounded cards, deep ink text, line icons, and a single green that is spent only on safety and the primary action. Status is never buried in settings; it leads every main screen as the safety banner.

Density is low and targets are large, built for less confident, older users as much as for households leaving paid clouds. Surfaces are flat; meaning is carried by colour family, material change and words, never by decoration. Motion is short and quiet and disappears under reduced motion.

Before a browser is unlocked (setup, unlock, forgot password, connect, reset) the same world speaks as an unhurried conversation: one centred column, the product mark, one `h1`, one sentence of why, one question, one green button. There is no banner and no nav, and nothing is timed.

**Key Characteristics:**
- One green, one amber, one red, each with a single meaning.
- The safety banner changes material with the box's truth.
- Icon plus words, always; never colour alone.
- 48px minimum targets, a visible two-ring focus, WCAG 2.2 AA.
- Inter, 17px body, bold short headings.

## Colors

A warm neutral ground with three semantic hues, each reserved for one meaning.

### Primary
- **Safe Green** (`safe`): the only accent. Its fill means "safe" or marks the primary action (primary buttons, form `accent-color`). Its family supports it: **Deep Safe Green** (`safe-strong`) for primary hover, active nav text, links and caret; **Safe Mist** (`safe-tint`) for the safe banner, active nav pill and text selection; **Safe Ink** / **Safe Ink Soft** (`safe-ink`, `safe-ink-2`) for text on the tint, and `safe-ink` for the viewer's "Safe" line on white.

### Secondary
- **Attention Amber** (`attention`) on **Amber Wash** (`attention-tint`), text in **Amber Ink** (`attention-ink`, `attention-ink-2`): only for "backup copy paused", "almost full" and "can't reach your box". Used as the attention card's 2px border and the Box tab's dot. `attention-strong` is reserved, not yet used.

### Tertiary
- **Delete Red** (`danger`): permanent deletion, in two strengths. Red words on a white quiet button where permanent deletion is offered (Delete forever on a Trash row, Empty Trash in the Trash header); a red fill only on the final confirm inside the confirm dialog ("Delete forever"). `danger-tint` is reserved, not yet used. **Open question (M2 Task 12):** the shipped entry pages also set field error text and the invalid input's border in `danger`, including the "Can't reach your box" message, and the Trash screen's failure lines ("Couldn't restore…", "This list may be out of date") reuse the same red field error. That is a second meaning for red and conflicts with The One Meaning Per Hue Rule below; it awaits the owner's decision. Until then, don't extend red to any other new use.

### Neutral
- **Warm Paper** (`ground`): page background and sidebar; inside a white dialog, the move confirm's grey Leaving box. Also the backing behind the scrubber's year marks and the ring round its grip, so a mark under the handle never peeks out.
- **White** (`surface`): cards (Box sections, the recovery key card, the Trash list), notices, banner strips in copying and checking states, bottom tab bar, inputs, secondary and quiet-danger buttons, dialogs, the Albums "More" link rows. On Photos: the upload panel, the select bar, the viewer's details card, the chosen segment of the segmented control and the scrubber's date pill. On Files: the file card, the search field and the row menu.
- **Sunk Paper** (`surface-sunk`): hover fill for buttons, sidebar items and More links; the "This browser" badge; the pairing code panel; code output; the delete sheet's option panel; a photo tile or Trash thumbnail while its thumbnail decrypts, and the file tile (no picture); the hover fill of a radio choice row; the backing of the small album covers in the picker and the move confirm. On Files: every type chip (folders included), the upload sheet's "Saving to" strip, and the hover fill of an icon button and a row menu item. No spinner.
- **Hairline** (`line`), **Firm Line** (`line-strong`): tab bar top border and dividers between device rows, upload rows, Trash rows and file rows, and above a row menu's last item; button, input and notice borders. `line` is also the backing a checked tile's photo shrinks onto; `line-strong` is the thin page scrollbar.
- **Meter Track** (`track`): unfilled storage meter and upload progress bar; the ground of the segmented control; the scrubber's 2px rail; the plain cover of an empty album on the Albums shelf (it must show on the ground, which `surface-sunk` doesn't), and the move confirm's "+k" cover.
- **Ink** (`ink`): primary text. Also the fill of the Move to Trash and Delete album buttons, the scrubber's grip, a checked tile's select check, and the hover select circle; the border and radio (`accent-color`) of a chosen radio choice row. **Ink Soft** (`ink-2`, 5.9:1 on ground): secondary text, ledes, field hints, the "Step n of 5" line, recovery word numbers, "Last seen" and "Valid until" lines, a Trash row's "{n} days left", the empty state, inactive tabs, checking banner, scrubber year marks, the More link's chevron. On Albums: an album's count, the back link, the empty album cover's icon, the Leaving label and the names of the albums being left. On Files: the earlier breadcrumb links and their › separators, column heads, the "Modified · Size" line and "In {folder}" under a name, the search magnifier and placeholder, an icon button at rest, and a disabled menu item with its reason line. **Ink Meta** (`ink-3`): table and meta text. On Photos: inactive segmented options, the uploading file's name, the upload progress fill and the viewer's "Backup copy pending" line. On Files: the Modified and Size cells, and a type chip's label. Also the Move to Trash button's hover fill.
- **Focus Green** (`focus`): the focus ring colour.

### Named Rules
**The One Green Rule.** Green means "safe" or "this is the primary action". Never use it decoratively, for categories or for brand flourish. One approved exception (owner, 2026-11-03): the storage meter fill is green, because the space it measures holds the photos the box is keeping safe. Green stays off every other meter, chart and category. Progress is not safety: the upload progress fill is `ink-3`, never green, because a file on its way is not safe yet. Second approved exception (owner, 2026-11-04): the album move confirm's arrow and Moving to row are green, because they show where the primary green Move button sends the photos. Green stays off other destinations, selections and highlights.

**The One Meaning Per Hue Rule.** Amber is attention (paused, almost full, unreachable) and nothing else. Red is permanent deletion and nothing else; moving to Trash is not red. No hue marks a category: file type chips are neutral (`surface-sunk` with an `ink-3` label), not a red PDF or a blue DOC (M2 Task 16 ruling, 2026-11-04, over the canvas's tinted chips); the type is told by its letters.

**The Reversible Is Ink Rule.** (Owner, 2026-11-04.) Move to Trash can be undone for 30 days, so its button is dark ink (`button--ink`), never red. Red appears only where something can't be undone: red words on a quiet white button where the choice is offered (Delete forever on a row, Empty Trash), and a red fill only on the final confirm. A red fill never appears outside that second question.

**The Never Colour Alone Rule.** Every status carries an icon and words with its colour. The active tab adds a shape (pill) to its colour; the attention dot is paired with the accessible name "Box, needs attention".

## Typography

**Body Font:** Inter Variable, self-hosted via `@fontsource-variable/inter` (fallback system-ui, -apple-system, Segoe UI, sans-serif). One family for everything people read as language; no display face.
**Label/Mono Font:** IBM Plex Mono 600, self-hosted via `@fontsource/ibm-plex-mono` (latin-600 only; fallback ui-monospace, monospace), token `--font-code`. Used for the pairing code and nothing else.

**Character:** Plain, legible and warm; hierarchy comes from weight and size, not from a second family. Numbers are tabular everywhere so counts and sizes don't jitter.

### Hierarchy
- **Headline** (700, 30px, 1.15, -0.01em): the single `h1` each screen owns. On solo pages it is `min(30px, 12vw)`, so one long word ("password?") still fits at 200% text on a 320px screen.
- **Title** (700, 19px, 1.3): product name in the sidebar, the attention banner's title, section headings.
- **Body** (400, 17px, 1.5): all running text and inputs; sidebar nav items; banner title in safe and copying states (bold). Ledes cap at 62ch.
- **Label** (600, 15px): buttons (primary is 700), storage card label, banner detail line, field labels.
- **Label XS** (600, 13px, 1.2): bottom tab labels, capped at `min(13px, 5vw)` so four one-word labels never wrap; active tab is 700. Also the "This browser" badge.
- **Recovery word** (600, 19px): each of the 24 words, never wrapped; its number sits beside it at 15px `ink-2` tabular figures, right-aligned.
- **Code** (IBM Plex Mono 600, 22px): the pairing code, shown in groups of four that each stay on one line.
- **Photos:** a group heading (day, month or year) is 19px semibold (600, not bold), with its count in 15px `ink-2` tabular figures beside it, wrapping under it when the space runs out. A group packed one tile wide uses its short date ("Sat, Oct 31"). The upload panel heading is 19px with tabular figures. The viewer title is 22px bold with -0.01em tracking. Segmented options are 15px semibold. A file tile's type ("HEIC") and a video's duration are 13px semibold, the type tracked 0.04em, the duration tabular. Scrubber year marks are 13px semibold `ink-2` tabular; its date pill is 15px semibold.
- **Dialogs:** the title is 22px bold with -0.01em tracking, like the viewer title; it breaks anywhere so a long file name never overflows.
- **Trash rows:** the name is 17px semibold (breaks anywhere); "{n} days left" is 15px `ink-2` tabular.
- **Albums:** section headings ("My albums", "More") are 19px bold. An album card's name is 17px semibold and wraps between words (never mid-word); its count is 15px `ink-2` tabular. On an album, Favourites or Videos, the `h1` is the 30px headline (breaks anywhere) with its count ("{n} photos", "{n} videos") beside it in 17px `ink-2` tabular, baseline-aligned. The back link is 17px semibold `ink-2`. A radio choice row's label is 17px semibold over a 15px `ink-2` detail. In the move confirm, "Leaving" and "Moving to" are 15px semibold in sentence case (`ink-2`, `safe-strong`); names are 17px semibold (`ink-2` when leaving, bold `ink` for the destination) over 15px counts.
- **Files:** the breadcrumb's last crumb is the screen's 30px headline (the `h1`, breaks anywhere), like every other screen; earlier crumbs and their › separators are 22px (`text-xl`) `ink-2`, the crumbs semibold and underlined. Column heads are 15px semibold `ink-2` in sentence case ("Name", "Modified", "Size"), never capitals (M2 Task 16 ruling). A name is 17px semibold `ink` (breaks anywhere); Modified and Size are 17px `ink-3` tabular figures. A type chip's label is the extension in capitals, 13px bold `ink-3`, tracked 0.02em, and −0.03em for four letters (DOCX, HEIC) so they still fit. Row menu items and the Sort select are 15px semibold.
- 15px (`text-sm`) carries field labels (600), hints and error text, the step line, and secondary lines in lists; 22px (`text-xl`) is the empty state's `h2`.

### Named Rules
**The 17 Rule.** Body text is 17px and is never set smaller for density. Text must scale to 200% with no sideways scroll at 320px.

**The One Face Rule.** Inter sets every word. One deliberate, scoped exception (owner, M2 Task 12): the pairing code is set in IBM Plex Mono so I, l and 1, and 0 and O, can't be confused when a person reads it off one screen and types it into another. The mono face is for codes a person must copy character by character; it is never a label, heading or decorative voice. The code's input field stays in Inter, with tabular figures and 0.04em tracking.

## Layout

One breakpoint at 720px. Above it, a sticky left sidebar (264px) on the ground holds the product mark, the four nav items as rounded rows, and the storage card; the main column fills the rest (padding 20px 24px 32px). At or below 720px, the sidebar's mark and storage card hide and the nav becomes four fixed bottom tabs (72px plus safe-area inset), icon over label; main pads 16px 12px and leaves room for the tab bar. Inline padding on small screens is in px so 200% text keeps room for words.

The safety banner is always the first thing in `<main>`, full width. Each screen's header row puts the `h1` left and its primary action right, wrapping when narrow. Main stacks sections with a 20px gap. Spacing is a 4px-based scale. Single-task pages (setup, unlock, forgot, connect, reset, errors) center one panel up to 34rem wide on the ground (padding 24px 16px), stacking with a 20px gap: product mark (24px box icon and bold "Cloud Box"), `h1`, lede, then the form. Forms stack fields 20px apart. The action row ends every form: primary button first, then Back or a text link, then (in setup only) "Step n of 5" pushed to the row's far end in quiet 15px `ink-2`. At or below 720px the primary button takes the full row width.

On Box, sections sit in an auto-fit grid of cards at least 22rem wide (16px gap), so they pair on wide screens and stack on narrow ones. An empty screen (Photos with no photos, an empty Trash) places a 40px line icon, a 22px heading and one sentence, left-aligned and capped at 40ch, 40px below the header.

Photos runs the header row as `h1` left and tools right: the Days / Months / Years segmented control, Select, then the green Upload photos, 12px apart and wrapping. The upload panel and, in select mode, the select bar sit between the header and the timeline.

The timeline is a wrapping grid, newest first. Each group (day, month or year) is a heading with its count, then rows of square tiles that fill the width, 6px apart. Tile sizes aim for 180 / 120 / 80px (Days / Months / Years) above 720px and 110 / 80 / 56px at or below it; the column count is what fits, never fewer than 3 / 4 / 6, and no tile is smaller than 48px. Tiles stretch to share the width evenly. A heading has 24px above it (none on the first) and 12px below. A group small enough for one row shares that row with the groups after it, each with its own heading above its own tiles; the headings and tiles line up across the row through CSS subgrid, and each packed group spans at least about 110px of columns so its heading has room. The page is virtualised by row (a heading row, a tile row or a packed row), not by group, so a day of thousands of photos never renders as one block; row positions and the column count are set through the CSSOM.

Once the laid-out timeline is longer than 2½ screens (and spans more than one month), the date scrubber appears. Above 720px it takes a 3.5rem column beside the grid (12px gap), sticky 16px from the top and the height of the viewport less 32px. At or below 720px there is no column to spare: only its handle shows, fixed over the right edge of the grid, between 16px from the top and just above the bottom tabs, and it stays hidden until the photos are scrolled into view (or it has keyboard focus), so it never covers the banner or the header.

The select bar stays in view (sticky, 12px from the top) only above 720px, with the page's scroll padding set so a focused tile scrolls clear of it. At or below 720px it stays in the flow so it never covers tiles. It holds the count left and its actions (Delete, Cancel; 8px apart, wrapping) right.

The viewer is a grid. At or below 720px the order is bar (Close and the title), the photo, then the tools, then details: photo first on phones, in reading and focus order. Above 720px the tools sit beside the title and the photo spans the width below (at least `min(60dvh, 32rem)` tall). From 1100px with Details open, details become a 20rem column beside the photo. The photo's height is capped in viewport units only (`max(60dvh, 100dvh - 240px)`), so large text never shrinks it.

Trash uses the standard header (`Trash` `h1`, Empty Trash right, only when Trash has items), then a polite status line (out of the flow while empty), any failure line, then the list as one white card (8px 20px padding). Each row is a 64px thumbnail, the name over "{n} days left", and the row's actions (Restore, Delete forever) pushed to the end, wrapping under the text when narrow; rows are 12px in block padding with a `line` hairline between them. Albums uses the standard header (`Albums` `h1`, the green New album right), then "My albums" (once there is one) and "More", each a 19px heading 12px above its content. The shelf is a grid of album cards: columns of at least 12.5rem (about 200px) above 720px with 20px row and 16px column gaps; at or below 720px columns of at least `min(100%, 9rem)` with 16px / 12px gaps, so two across at normal text and one at 200%. With no albums, the empty state stands in for the shelf. "More" is a column of link rows (Favourites, Videos, Trash · n), at most 28rem wide, 8px apart.

An album, Favourites and Videos put a back link ("‹ Albums", 48px tall, pulled up 8px and 16px into the gaps around it) above the Photos-style header: the title with its count left, then the tools (Days / Months / Years when there are photos, and on an album Rename and Delete album), wrapping. The timeline below is the Photos timeline.

Files uses the same header row, with the breadcrumb as the heading on the left (crumbs wrap at 8px gaps, baseline-aligned) and the green Upload to {folder} on the right. Below it, one tools row 8px apart and wrapping: the search field grows (from 16rem, never under `min(100%, 12rem)`), then New folder and Sort keep their size. The rows sit in one white card. Above 720px the card holds a table: Name takes the slack, Modified and Size don't wrap, Size is right-aligned, and a 48px column ends each row for its ⋯ button. Cells pad 4px 16px (heads 12px 16px); a name row is at least 56px; a `line` hairline separates rows. At or below 720px the head and the Modified and Size columns go and the same rows stack as a list: chip, the name with "{Modified} · {Size}" under it, ⋯ at the end, inline padding 12px. The card is a container: under 22rem (200% text on a phone) the chips hide and the ⋯ column is held at 48px so the names keep the width. No sideways scroll at any width.

Dialogs are modal: centred, at most 30rem wide (and 32px narrower than the screen), at most the viewport height less 32px and scrolling inside past that. At or below 720px a dialog becomes a sheet from the bottom: full width, square bottom corners, 16px inline padding (24px elsewhere), extra bottom padding for the safe-area inset, and its action buttons share the row's width. Contents stack 16px apart; the action row is right-aligned, Cancel first, 12px apart, 8px further from what precedes it. Radio choice rows stack 8px apart; a long album list scrolls inside the dialog (at most `min(22rem, 50dvh)` tall) so the buttons stay in reach, and its rows keep their height. Inside a dialog, decorative covers hide when their container is 22rem wide or less (large text in a narrow dialog): the words need the room more than the pictures.

Widths 320 to 2560px are supported.

### Named Rules
**The Every Photo Under Its Heading Rule.** Photos are read as days (or months, or years), each under a heading with its count, newest first; Months and Years show every photo, only smaller, and nothing is curated or hidden. The whole grid is one tab stop: ← → follow reading order, ↑ ↓ keep the nearest column, Home and End go to the ends of the row, Ctrl (or Cmd) with Home or End to the ends of the library, Page Up and Page Down a screen at a time. The tile holding the tab stop is always rendered.

## Elevation & Depth

Flat. Depth is tonal: white surfaces on a warm ground, tints for state, hairline borders where a surface meets the ground edge (tab bar). Box-shadow is used for the focus ring, the attention card's inset 2px amber border, the notice's inset 1px `line-strong` border and the inset 1px `ink` that doubles a chosen choice row's border. Album cards, choice rows and the move confirm's boxes stay flat. The soft `shadow-raised` token (sidecar) is kept for what genuinely floats or lifts: the Photos select bar while sticky above 720px; dialogs; a row menu; the scrubber's date pill, and its grip on phones where it floats over the photos; and a photo tile while a mouse hovers it. A dialog also dims the page behind it with an `ink` backdrop at 45%. At rest, tiles, the upload panel, the viewer stage, the details card and every card stay flat.

### Named Rules
**The Flat Panel Rule.** Surfaces separate by tone, not by shadow. Introduce `shadow-raised` only for a surface that genuinely floats (a dialog, a sheet, a row menu, the sticky select bar, the scrubber's pill) or as a hover response on a photo tile; never for a card at rest.

## Shapes

Soft, friendly rounding in four steps: 6px (`rounded.xs`) for photos only (timeline tiles, a checked tile's shrunk photo, the viewer photo, Trash thumbnails, a photo file's thumbnail in its Files chip), so pictures read as pictures and not as cards; 10px for small chips (the Files type chips) and the default focus outline, 14px for the row menu, the upload sheet's "Saving to" strip, the banner strip, sidebar cards, sidebar nav rows, inputs, notices, the pairing code panel, the delete sheet's option panel, the More link rows, radio choice rows, the move confirm's Leaving box, Moving to row and its 52px covers, and the Albums shelf's 4:3 album covers, 18px for content cards, the recovery key card, the attention card, the upload panel, the viewer stage, the details card, the Trash list card, the Files card and dialogs (on phones only the sheet's top corners). Buttons, the skip link, meter, upload progress bar, tab icon pill, attention dot, video chip, the "This browser" badge, the scrubber's rail and date pill, the Files search field and Sort select are full pills; an icon button (the row's ⋯, Clear search) is a 48px circle. The segmented control and the select bar are pills on one line that become rounded boxes (24px and 32px radius) when large text wraps them; a tile's select check, the hover select circle and the scrubber's grip are circles. The picker's 40px album covers are 6px. Borders are 1px; the heaviest strokes are 2px: the attention card's amber border and the Moving to row's green border. A chosen choice row draws a 2px `ink` edge (1px border plus a 1px inset shadow). Approved exception (owner, 2026-11-04): album covers on the shelf and in the move confirm are photos at 14px, because they are the album's face, not a picture in the timeline. Don't extend 14px to any other photo. Icons are line icons on a 24-unit grid, 2px stroke, rounded caps and joins.

## Components

### Buttons
- **Shape:** full pill (`rounded.pill`), at least 48px tall, 20px side padding.
- **Primary:** safe green fill, white bold label; hover deepens to `safe-strong`. One per screen header.
- **Secondary:** white with a `line-strong` border, ink label; hover fills `surface-sunk`.
- **Ink:** `ink` fill and border, white semibold label; hover `ink-3`. For Move to Trash and Delete album (its photos are kept, or go to Trash for 30 days): firm, reversible, not red.
- **Quiet danger:** the secondary button with its label in `danger`. Where permanent deletion is offered: Delete forever on a Trash row, Empty Trash (with its trash icon) in the Trash header. It always opens a confirm dialog; it never deletes by itself.
- **Danger:** red fill, white label; only the final confirm of a permanent deletion ("Delete forever" in the confirm dialog).
- **Disabled:** 55% opacity, not-allowed cursor.
- **Busy:** the button that started the work is disabled and says what is happening ("Moving to Trash…", "Deleting…", "Restoring…").
- **Back link:** a 48px text link, a 18px chevron-left and the word ("Albums") in `ink-2` semibold, `ink` on hover; above the header of a sub-page.
- **Pressed / expanded:** a secondary button that toggles (Select, Favourite, Details) shows its state with an `ink` border via `aria-pressed` or `aria-expanded`; Favourite also fills its heart.
- **Icon button:** a 48px circle with no fill or border, a 20px icon in `ink-2`; hover and `aria-expanded` fill it `surface-sunk` and turn the icon `ink`. Only where the word is in its accessible name and the job is plain from its place: a row's ⋯ ("More options for {name}") and the search field's Clear search.
- **Select as button:** the Sort select wears the secondary pill (16px side padding, 15px semibold) and keeps its native arrow; its options carry the word ("Sort: Name"). Disabled while searching, since results keep their own order.
- **File chooser:** "Choose files" is a `label` styled as the primary button, wrapping a visually hidden file input; the ring shows on the label when the input has keyboard focus.
- **Icons:** always beside a word (the viewer's Previous and Next keep their words on every width), except an icon button whose name says the word; 18px in buttons.

### Segmented Control
A `track` pill holding 48px options (15px semibold, `ink-3`, 20px side padding). The chosen option (`aria-pressed`) becomes a white pill with `ink` text, inset by a 3px `track` border. A labelled group ("Group photos by"); used for Days / Months / Years.

### Cards / Containers
- **Content card:** white, 18px radius, 24px padding, no border, no shadow.
- **Storage card (sidebar):** white, 14px radius, 16px padding; label `{used} of {size} used` above an 8px pill meter (track `track`, fill `safe`). Hidden when status is unknown or unreachable. The fill width is set through the CSSOM.

### Inputs / Fields
- **Style:** white, 1px `line-strong` border, 14px radius, 48px tall, 17px text; label above in 15px semibold. In a form the input fills the column width.
- **Focus:** border turns `focus` plus the focus ring.
- **Order:** label, then hint (15px `ink-2`), then the input, then any error. Hint and error are tied to the input with `aria-describedby`.
- **Error:** a warning icon (20px) beside 15px semibold text, `role="alert"`, under its field; the input gets `aria-invalid` and its border changes colour (currently `danger`; see the open question under Colors). Errors stay until the field changes; never timed, never auto-dismissed, never repeating what was typed.
- **Text area:** the same field, at least 144px tall, 12px 16px padding, resizes vertically. Used for the 24 recovery words.
- **Code input:** the same field with tabular figures and 0.04em tracking; it stays in Inter.
- **Search field:** a pill (48px, white, `line-strong` border) with a 20px `ink-2` magnifier 16px in, the text clear of it, and an `ink-2` placeholder ("Search files") over a visually hidden label. The native cancel cross is removed; once there is text, a 48px Clear search icon button sits at the right end and the text stops short of it. Focus turns the border `focus` and adds the ring.
- **Typing secrets:** password, code and word fields switch off autocorrect, capitalisation and spellcheck.

### Checkbox
A 24px native box (green through `accent-color`) beside a 17px semibold label; the whole row is the 48px target. Used once, for "I understand" before a reset.

### Notice
A white strip with an inset 1px `line-strong` border, 14px radius, 16px padding: a 20px warning icon beside the words. The warning variant sets the words semibold. It stays ink on white, never amber, because it is not one of amber's three meanings (for example, "This signs out every phone and computer").

### Entry Pages
- **Panel:** the solo column above; on a step change, focus moves to the new `h1` (no ring is drawn on the heading).
- **Busy:** the primary button is disabled and says what is happening ("Connecting…", "Resetting…"); the panel sets `aria-busy`. Never a spinner alone.
- **Waiting:** setup's "Waiting for the press…" line is plain `ink-2` text in a polite status region; no countdown.
- **Text links in the action row:** 48px tall, semibold (for example "Lost all your devices? Use your recovery key").

### Recovery Key Card (signature)
The one white card in setup: 18px radius, 24px padding (16px and tighter gaps at or below 720px, so "I've written it down" stays above the fold). A 19px heading, the 24 words as a numbered ordered list, and a 15px `ink-2` keep-it-safe note. The list fills columns of at least 8em: 3 on desktop, 2 on phones, 1 when 200% text needs the width. A word is never split. When the card itself is 17rem wide or less (a container query), each number moves above its word so the longest word gets the full width.
- **Print:** printing shows only this card, on one sheet with 18mm margins: "Cloud Box recovery key" (18pt bold), the 24 words in 3 columns (13pt numbers, 15pt words), a "Made on {date}. Kept at: ____" line and a line saying anyone holding the sheet can open the photos. The on-screen heading and keep note are hidden in print; the print-only lines are hidden on screen. Everything else is `display: none`, so there is no blank second page.

### Empty State
A 40px line icon and the text in `ink-2`, a 22px `ink` heading ("No photos yet", "Trash is empty") and one sentence saying what happens next. The screen's primary action stays in the header row, not inside the empty state. Albums: "No albums yet", "No photos in this album yet", "No favourites yet", "No videos yet", each with its own icon (albums, heart, video). Where the page has nothing else, such as a missing album ("This album isn't here", under the back link), the empty state's heading is the page's `h1`, still 22px `ink`.

### Device List
Inside a Box section card (19px heading). One row per device: semibold name (breaks anywhere rather than overflowing), an optional "This browser" badge (13px semibold pill on `surface-sunk`), and a 15px `ink-2` "Last seen …" line on its own line. Rows have 12px block padding and are divided by a 1px `line` hairline; the first row has none.

### Pairing Code
A `surface-sunk` panel (14px radius, 16px padding) inside the Add a device card: a 15px semibold "Pairing code" label, the code in IBM Plex Mono 600 at 22px as groups of four that wrap between groups but never inside one, and a 15px `ink-2` "Valid until {time}. It works once." line. Once a code exists the button becomes secondary ("Make a new code").

### Photo Timeline (signature)
- **Group heading:** the group's name (19px semibold) and count (15px `ink-2`), baseline-aligned 12px apart; no buttons.
- **Tile:** a square photo, `object-fit: cover`, 6px radius, on `surface-sunk` until its thumbnail decrypts; no frame, no backup badge. A tile is a link to the viewer named by its date and kind; focus draws the standard ring. With no picture it is a file tile: a 28px file icon over the type in capitals.
- **Hover (mouse and trackpad only, `hover: hover`):** the photo greys slightly (`saturate(0.6) brightness(0.92)`), the tile takes `shadow-raised` and lifts 3px (220ms `ease-out`; no lift under reduced motion, the greying stays). Outside select mode a soft ink shade fades in along the top 40% of the tile and the select circle appears. Focus keeps its ring alongside the hover shadow. A tap on a phone never leaves a tile in this state.
- **Select circle:** a 28px circle at the tile's top-right, 2px white ring over a translucent ink fill with a faint 16px check; hovering the circle fills it `ink` with a white check. Clicking it starts Select with that photo ticked. It is not a tab stop and has an accessible name ("Select {tile}"); Select in the header does the same job from the keyboard.
- **Video chip:** bottom-left, a dark translucent pill with white 13px semibold text: a 16px play mark and the duration.
- **Select mode:** each tile becomes a checkbox covering the whole tile. A 28px circle with a 2px white ring sits top-right; checked, it fills `ink` with a white check, and the photo shrinks to 88% onto a `line` backing (220ms `ease-out`, none under reduced motion).
- **Select bar:** a white pill holding the count ("Choose photos", "1 selected", "{n} selected", polite) and its actions: Delete (secondary, trash icon, disabled until a photo is chosen; it opens the delete sheet) and Cancel. Sticky, with `shadow-raised`, only above 720px; flat in the page flow on phones.

### Date Scrubber (signature)
- **Track (above 720px):** a 2px `track` rail down the middle of its column, with year marks where each year starts (13px semibold `ink-2` on a `ground` backing). Marks closer than 22px are dropped, and a mark under the handle hides, so they never overlap.
- **Handle:** a 48px-tall target holding a 36px `ink` circle grip with a white 18px up-down icon and a 4px `ground` ring. While dragging the grip grows to 108% (120ms). A white date pill ("March 2024", 15px semibold, `shadow-raised`) appears to its left while dragging, hovering or focused.
- **Use:** drag it or click the track; the page scrolls in step. For the keyboard it is a vertical slider named "Jump to a date", its value the month ("March 2024"): ↑ ↓ (and ← →) move a month, Page Up and Page Down a year, Home and End to either end. Focus rings the grip. Stops and marks come from the decrypted items in the browser; the box learns no dates.
- **Phones:** only the handle, fixed at the right edge; the grip loses its ground ring and takes `shadow-raised`. While the banner and header are in view it fades out (220ms) and ignores the pointer, unless it has keyboard focus.

### Upload Panel
A white card (18px radius, 20px padding, 12px gap) that stays until closed. A 19px heading ("Uploading {i} of {n}", polite) with Close; the current file's name (15px `ink-3`, breaks anywhere) labels an 8px pill `<progress>`: `track` behind, `ink-3` fill, never green. When done, a check icon and an `ink-2` line. Duplicates and failures follow as rows (at least 48px, 1px `line` top border): semibold name, a 15px `ink-2` note (a warning icon and `role="alert"` for failures), and the row's action (Restore, Try again) pushed to the end, named with the file.

### Photo Viewer
- **Bar:** Close (secondary, icon and word) then the 22px title (the date), which takes focus on open with no ring.
- **Stage:** 18px radius, at least 12rem tall, the photo or video centred inside at 6px radius. While the original loads, the thumbnail shows blurred (14px) and slightly enlarged. If it can't be shown, a centred `ink-2` note (40px file icon, at most 32ch) says to download it; videos over 2 GiB are Download only.
- **Tools:** Previous, Next, Favourite, Details, Download ("Downloading…" while busy), Delete (secondary, trash icon; opens the delete sheet), right-aligned beside the title above 720px and left-aligned on phones. ← and → walk the whole timeline. A failed download shows a field-style error under the tools. After Move to Trash the viewer shows the next older photo (or the newer one at the end, or returns to Photos).
- **Details:** a white card (18px radius, 20px padding): 19px "Details" heading, a name / size list (15px `ink-2` terms), then one status line with a 20px shield icon, semibold. "Safe: on your box and the backup copy" (`safe-ink`, shield-check) shows only when the item is replicated and the box's status is known with the backup copy running; otherwise "On your box. Backup copy pending." (`ink-3`, shield-clock).

### Dialog
A native modal `<dialog>`, open while mounted: a white card (18px radius, 24px padding, 16px gap, `shadow-raised`) over an `ink` backdrop at 45%, centred on wide screens and a bottom sheet on phones (see Layout). It enters with a 220ms fade and a 12px rise (`ease-out`; none under reduced motion). It is labelled by its 22px bold title, starts focus on Cancel (the safe choice), closes on Esc, and gives focus back to the button that opened it, or to a stated fallback when that button has gone (its row was deleted). While busy, Esc and other closes are ignored so the result or error is seen.

### Delete Sheet
The dialog for moving to Trash, from the viewer and the select bar. Title "Delete this photo?" / "Delete {n} photos?" / "Delete this file?", a reassurance line ("It stays safe on your box until you choose."), then the one choice described in a `surface-sunk` panel (14px radius, 16px padding): a 22px trash icon beside a semibold "Move to Trash" over a 15px `ink-2` "You can restore it from Trash for 30 days." It is a description, not a control. Then Cancel and the ink Move to Trash button. A failure shows a field-style error above the buttons and focus returns to Move to Trash.

### Trash
- **Header:** `Trash` `h1`; Empty Trash (quiet danger, trash icon) right, only when there are items. It confirms with "Empty Trash?" and "Delete {n} items forever? This can't be undone."
- **Row:** a 64px thumbnail at 6px radius on `surface-sunk` (a video keeps only its play mark, a file tile only its icon), the semibold name over "{n} days left" ("Less than a day left" at zero), then Restore (secondary, restore icon; "Restoring…" while busy) and Delete forever (quiet danger). Both name the item ("Restore {name}"). Delete forever confirms with "Delete forever? This can't be undone." and the name.
- **Confirm:** the dialog with Cancel and the red Delete forever ("Deleting…" while busy). It closes when the delete settles; a failure is told on the page and the list is read again.
- **Status:** a polite status line says "Restored {name}". After a row goes, focus moves to the row that took its place, or to the `h1`.

### More Links (Albums)
A white row (14px radius, at least 48px, 12px 16px padding, 12px gap): a 22px line icon, a semibold label (Favourites, Videos, and Trash with a tabular count, "Trash · 3"), and a 20px `ink-2` chevron at the end. The icons never shrink. Hover `surface-sunk`. Grouped in a `nav` labelled by the "More" heading.

### Album Shelf
- **Card:** one link with no chrome of its own: a 4:3 cover (14px radius, the album's newest photo `object-fit: cover`; an empty album shows a 32px album icon in `ink-2` on `track`), then the name (17px semibold, wrapping between words) and the count (15px `ink-2`, "{n} photos"). A video cover shows its picture only, no chip.
- **Hover (`hover: hover`):** the cover greys like a tile (`saturate(0.6) brightness(0.92)`, 220ms) and the name underlines; no lift, no shadow. Focus draws the standard ring round the card.

### Radio Choice Rows
Used in the delete-album dialog and the album picker. A row (14px radius, 1px `line-strong` border, 12px padding, 12px gap, at least 48px) holds a 22px native radio (`accent-color` `ink`), optional media, and a semibold label over an optional 15px `ink-2` detail. The whole row is the target; hover `surface-sunk`. Chosen: the border turns `ink` and doubles to 2px. Grouped in a `fieldset` with a visually hidden legend. The words explain; the radio is the control.

### Album Picker
The dialog behind Add to album (select bar and viewer, secondary buttons with the album icon). Title "Add to album"; one choice row per album with a 40px cover (6px radius, on `surface-sunk`, the album icon when empty; video chips and file labels hidden) and its count, then a "New album" row with the album icon; choosing it shows an "Album name" field below the list. Focus starts on the first album (or the name field when there are none). Cancel and the green Add ("Adding…"). Success closes it and says "Added to {album}" in a polite status line on the page.

### Move Confirm (signature)
The picker's second step, only when some chosen photos already sit in another album (a photo lives in one album). Title "Move this photo?" / "Move {n} photos?", the line "A photo lives in one album, so it will only be in the new one." (several: "…so these will only be in the new one."), then:
- **Leaving:** a grey box on `ground` (14px radius, 8px 12px 12px padding, 8px gaps), its "Leaving" label, then one row per album the photos leave, most first: a 52px cover at 60% opacity, the name in `ink-2` semibold and its count. At most four rows; past that three and a "+k" row on `track` ("{k} more albums" with their photo count).
- **Arrow:** a 30px down arrow in `safe`, 4px above and below.
- **Moving to:** a row on `safe-tint` with a 2px `safe` border (14px radius, 12px padding): the target's 52px cover (the album icon for a new album), the "Moving to" label in `safe-strong`, the name in bold `ink`, and for several photos the count in `safe-ink` ("{n} photos", or "{n} photos in all" when some come from Photos). Green by the owner's exception under The One Green Rule.
- **Note:** when some photos are only in Photos, a 15px `ink-2` line under the box ("1 photo from Photos is added too.").
- **Buttons:** at the end like any dialog: Cancel (back to the list, the choice kept; focus returns to the chosen radio) and the green Move photo / Move photos ("Moving…"). Entering the step focuses Cancel. Covers hide under a 22rem container.

### Album Dialogs
- **New album / Rename album:** a sheet with one "Name" field (focus starts in it), Cancel and the green Create / Rename ("Creating…", "Renaming…"). An empty name says "Give the album a name." under the field.
- **Delete album:** title `Delete "{name}"?`; with photos in it, two choice rows: "Keep the photos" (chosen by default, "They move back to Photos.") and "Move the photos to Trash" ("You can restore them from Trash for 30 days."); with none, "There are no photos in it." Focus starts on Cancel; the confirm is the ink Delete album ("Deleting…"), never red, because nothing here deletes a photo for good.

### Breadcrumb Heading
The heading of Files and of every folder, inside a `nav` labelled "Breadcrumb": an ordered list, `Files` › … › the folder you are in. Earlier crumbs are links (22px semibold `ink-2`, underlined 0.18em below, 48px tall, `ink` on hover); the last crumb is the screen's 30px `h1` with `aria-current="page"`. Long names wrap; nothing is cut off. A folder that has gone shows the empty state with "This folder isn't here any more" as its `h1` and a link back to Files.

### File Table (signature)
- **Card:** one white card (18px radius, no padding, no shadow, `container-type: inline-size`) holding a real `table` above 720px and the same rows stacked as a list at or below it.
- **Name cell:** a 40px chip, then the name over its sub-lines ("{Modified} · {Size}" on phones; "In Files › {folder}" on a search result). The whole cell is the target: the name (a link into a folder, a button that opens or downloads a file) stretches its hit area over the cell with an `::after`. Hover underlines the name; focus draws an inset 3px `focus` ring round the cell (10px radius).
- **Type chip:** a neutral 40px square (10px radius, `surface-sunk`): a folder shows a 20px `ink` folder icon, a file its extension (up to four letters) or a 20px file icon when it has none. A photo file shows its own decrypted thumbnail at 6px, the photo radius, with the label until it is ready. Chips are decorative (`aria-hidden`) and hide under a 22rem card.
- **Columns:** Name, Modified, Size (sentence-case 15px semibold `ink-2` heads, the ⋯ column's head visually hidden as "Actions"). Size is right-aligned with tabular figures; a folder's size is its count ("3 files", or "2 folders" when it holds only folders).
- **Row menu button:** the ⋯ icon button at the end of every row.

### Row Menu
A small white popover under its ⋯ button, right-aligned to it (above it when there is no room below): 14px radius, 1px `line-strong` border, `shadow-raised`, 4px block padding, 12–18rem wide. Items are 48px rows of 15px semibold `ink`, 16px side padding; hover and focus fill `surface-sunk`, focus adds an inset 3px `focus` ring. The last item sits after a `line` hairline. A file offers Download, Move to…, Delete; a folder offers Rename, Delete (no Move: folders can't move yet). Delete is `ink`, never red, because it goes to Trash (The Reversible Is Ink Rule; M2 Task 16 ruling). An unavailable item ("Folder isn't empty") stays focusable with `aria-disabled`, turns `ink-2`, and a reason line under the items says why ("Move or delete what is in it first."), tied to it by `aria-describedby`. Focus enters on the first item; ↑ ↓, Home and End move; Esc closes and returns focus to the button; Tab or a click elsewhere closes it.

### Upload Sheet
The dialog behind Upload to {folder}. First a `surface-sunk` strip (14px radius, 12px 16px padding): a 20px `ink-2` folder icon, "Saving to Files › {folder}" in semibold `ink` (breaks anywhere), and a secondary Change button (`aria-expanded`) that reveals the folders as radio choice rows (a 40px folder cover, the name, "In {path}"). Then Cancel and "Choose files", the primary button that opens the file chooser; focus starts there. Choosing files closes the sheet and the upload panel carries progress.

### Move Picker
The dialog behind Move to…: title `Move "{name}"`, the folders as radio choice rows (a 40px folder cover on `surface-sunk` at 6px, the name, "In {path}"). The folder the file is in is disabled with "It's here now" as its detail; focus and the choice start on the first other folder. Cancel and the green Move ("Moving…"); a failure shows a field-style error and focus returns to Move. Done says "Moved to {folder}" in the page's polite status line.

### Folder Dialogs
- **New folder / Rename:** the album name dialog in a folder's words: one "Name" field, Cancel and the green Create / Rename.
- **Delete folder:** only an empty folder can be deleted. Title `Delete "{name}"?`, the line "The folder is empty, so nothing else is deleted.", focus on Cancel, and the ink Delete folder ("Deleting…"), never red. A file's Delete opens the delete sheet ("Delete this file?").

### File Viewer and File Details
- **Opening a file (owner, 2026-11-04):** clicking a photo's or PDF's name opens it inside Cloud Box at `/files/open/{id}`, never in a new tab. The photo viewer's frame: Close, then the file name (22px bold h1, focused on arrival) with "In {path} · {size}" in 15px `ink-2` under it; Download, Move to… and Delete at the end. Close returns to the folder with focus on the file's name.
- **Stage:** a photo shows its preview at the photo radius; a PDF shows in the browser's own reader in a frame (18px radius, white, viewport-tall). Where the browser has no PDF reader (Android Chrome) or the file is over the in-memory limit, the stage says why and points to Download; it is never left blank.
- **File details sheet:** any other file (an installer, a spreadsheet) opens a sheet titled with its name: a 15px line with the file icon ("This can't be shown here. Download it to open it."), Size / Modified / Folder as a two-column list (`ink-2` 15px terms), then Move to…, Delete, Close and the green Download. Focus starts on Close; nothing downloads until Download is pressed.

### Navigation
- **Sidebar (above 720px):** rows 48px tall, 22px icon then 17px label, 14px radius. Hover `surface-sunk`; active (`aria-current`) `safe-tint` fill with `safe-strong` bold text.
- **Bottom tabs (720px and below):** white bar with a hairline top border; four equal cells, 24px icon over a 13px label. Inactive `ink-2`; active `safe-strong` bold with a `safe-tint` pill behind the icon. Focus is an inset 3px `focus` ring.
- **Current item:** `aria-current="page"` on the area's own page; `aria-current="true"` on the area a page belongs to (a sub-page under it, or Trash, which is reached from Albums, so Albums stays marked on `/trash`). Both look the same.
- **Attention dot:** a 12px amber dot with a 2px white ring on the Box icon, only in attention states (paused, almost full, unreachable), never for copying or checking. The link's name becomes "Box, needs attention".
- **Skip link:** ink pill with white bold text, off screen until focused.

### Focus
Every focusable element shows `--focus-ring`: a 2px white gap then a 3px `focus` green ring (box-shadow, since outlines are removed). It is never removed. Elements that set their own box-shadow (the attention banner, a hovered tile) restate the ring alongside it.

### Safety Banner (signature)
A shield-marked strip that changes material with the box's truth. Icon (22px; 28px in attention) plus a bold title and a detail line; a chevron when the whole banner links to Box (everywhere except Box itself).
- **Safe:** `safe-tint` strip, `safe-ink` text, shield-check icon. "Everything is safe" (on Photos, "All {n} photos are safe") with "Backup copy updated {time}". Shown only when the box reports safe and no warning stands.
- **Copying:** white strip, full ink title, shield-sync icon, "{n} waiting for the backup copy".
- **Checking:** white strip, `ink-2` text, shield-clock icon, "Checking your box…". Never green, never says safe.
- **Attention:** grows into an amber card (`attention-tint`, inset 2px `attention` border, 18px radius, 16px padding, 19px title, stacked detail) holding the reason and what to do. Warning icon for paused and almost full; no-signal icon for unreachable.
- **Announcements:** polite live region for safe, copying and checking; assertive alert for attention states.
- **Motion:** background, border, padding and radius ease over 220ms (`ease-out`); none under reduced motion. Hover on the linked banner slightly saturates it.

## Do's and Don'ts

### Do:
- **Do** use token names from `tokens.css`, never raw values; a new value needs owner approval and a DESIGN.md update.
- **Do** lead every main screen with the safety banner, and pair every status colour with an icon and words.
- **Do** keep every interactive target at least 48px (`--target-min`) and keep the focus ring visible.
- **Do** set dynamic values (meter widths, positions) through the CSSOM (`el.style.setProperty`); the CSP is `style-src 'self'`.
- **Do** keep line icons at 2px stroke with rounded joins, aria-hidden beside a visible word.
- **Do** honour `prefers-reduced-motion`: durations drop to 0.
- **Do** give each entry page one `h1`, one question and one primary button, with the step line ("Step n of 5") at the end of the action row.
- **Do** tie every hint and error to its field, and keep errors until the field changes.
- **Do** set codes a person must copy character by character in `--font-code`; everything else in Inter.
- **Do** keep photos at 6px radius (`rounded.xs`) and cards at 14 or 18px; a photo is not a card.
- **Do** keep visible words on the viewer's Previous and Next.
- **Do** make the photo grid one tab stop, with arrows, Home, End and Page Up / Page Down inside it.
- **Do** use the ink button for Move to Trash, and put red only on permanent deletion: red words where it is offered, a red fill only on the final confirm.
- **Do** start every dialog's focus on Cancel, close it on Esc, and return focus to its opener.
- **Do** keep hover-only affordances (the tile lift, the select circle) behind `hover: hover`, with a keyboard route to the same action.
- **Do** let words win over pictures in a narrow dialog: decorative covers hide under a 22rem container, and names wrap between words.
- **Do** keep file type chips neutral and let their letters tell the type.
- **Do** make the whole name cell the target of a file row, and keep the Size column right-aligned in tabular figures.
- **Do** keep a disabled menu item focusable, with a visible line saying why.

### Don't:
- **Don't** use green for anything but "safe" or the primary action.
- **Don't** show green or the word "safe" while checking, copying or in any attention state.
- **Don't** use red for anything but permanent deletion, or amber for anything but paused, almost full or unreachable.
- **Don't** make Move to Trash, or anything reversible, red.
- **Don't** use inline `style` attributes or injected `<style>`; the CSP blocks them.
- **Don't** show the Box attention dot for copying or checking.
- **Don't** let tab labels wrap or shrink body text below 17px.
- **Don't** put the step count, or any other small label, above an `h1` as an eyebrow.
- **Don't** use the mono face for labels, headings, numbers in general or decoration.
- **Don't** split a recovery word or a pairing code group across lines.
- **Don't** add time limits, countdowns or auto-dismissing errors to entry pages.
- **Don't** fill progress bars green; progress is `ink-3` on `track`.
- **Don't** say "Safe" for an item unless it is replicated and the backup copy is running; tiles carry no backup badges.
- **Don't** make the select bar sticky at or below 720px, where it would cover tiles.
- **Don't** curate or hide photos in Months or Years; they show every photo, only smaller.
- **Don't** colour file types (a red PDF, a blue DOC); a hue is a meaning, not a category.
- **Don't** set column heads, labels or headings in capitals; only a file type's own letters (PDF, HEIC) are.
