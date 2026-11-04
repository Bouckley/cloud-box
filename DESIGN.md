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
- **Warm Paper** (`ground`): page background and sidebar. Also the backing behind the scrubber's year marks and the ring round its grip, so a mark under the handle never peeks out.
- **White** (`surface`): cards (Box sections, the recovery key card, the Trash list), notices, banner strips in copying and checking states, bottom tab bar, inputs, secondary and quiet-danger buttons, dialogs, the Albums "More" link rows. On Photos: the upload panel, the select bar, the viewer's details card, the chosen segment of the segmented control and the scrubber's date pill.
- **Sunk Paper** (`surface-sunk`): hover fill for buttons, sidebar items and More links; the "This browser" badge; the pairing code panel; code output; the delete sheet's option panel; a photo tile or Trash thumbnail while its thumbnail decrypts, and the file tile (no picture). No spinner.
- **Hairline** (`line`), **Firm Line** (`line-strong`): tab bar top border and dividers between device rows, upload rows and Trash rows; button, input and notice borders. `line` is also the backing a checked tile's photo shrinks onto; `line-strong` is the thin page scrollbar.
- **Meter Track** (`track`): unfilled storage meter and upload progress bar; the ground of the segmented control; the scrubber's 2px rail.
- **Ink** (`ink`): primary text. Also the fill of the Move to Trash button, the scrubber's grip, a checked tile's select check, and the hover select circle. **Ink Soft** (`ink-2`, 5.9:1 on ground): secondary text, ledes, field hints, the "Step n of 5" line, recovery word numbers, "Last seen" and "Valid until" lines, a Trash row's "{n} days left", the empty state, inactive tabs, checking banner, scrubber year marks, the More link's chevron. **Ink Meta** (`ink-3`): table and meta text. On Photos: inactive segmented options, the uploading file's name, the upload progress fill and the viewer's "Backup copy pending" line. Also the Move to Trash button's hover fill.
- **Focus Green** (`focus`): the focus ring colour.

### Named Rules
**The One Green Rule.** Green means "safe" or "this is the primary action". Never use it decoratively, for categories or for brand flourish. One approved exception (owner, 2026-11-03): the storage meter fill is green, because the space it measures holds the photos the box is keeping safe. Green stays off every other meter, chart and category. Progress is not safety: the upload progress fill is `ink-3`, never green, because a file on its way is not safe yet.

**The One Meaning Per Hue Rule.** Amber is attention (paused, almost full, unreachable) and nothing else. Red is permanent deletion and nothing else; moving to Trash is not red.

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

Trash uses the standard header (`Trash` `h1`, Empty Trash right, only when Trash has items), then a polite status line (out of the flow while empty), any failure line, then the list as one white card (8px 20px padding). Each row is a 64px thumbnail, the name over "{n} days left", and the row's actions (Restore, Delete forever) pushed to the end, wrapping under the text when narrow; rows are 12px in block padding with a `line` hairline between them. Albums currently holds a "More" column of link rows, at most 28rem wide, 8px apart, the way to Trash.

Dialogs are modal: centred, at most 30rem wide (and 32px narrower than the screen), at most the viewport height less 32px and scrolling inside past that. At or below 720px a dialog becomes a sheet from the bottom: full width, square bottom corners, extra bottom padding for the safe-area inset, and its action buttons share the row's width. Contents stack 16px apart; the action row is right-aligned, Cancel first, 12px apart, 8px further from what precedes it.

Widths 320 to 2560px are supported.

### Named Rules
**The Every Photo Under Its Heading Rule.** Photos are read as days (or months, or years), each under a heading with its count, newest first; Months and Years show every photo, only smaller, and nothing is curated or hidden. The whole grid is one tab stop: ← → follow reading order, ↑ ↓ keep the nearest column, Home and End go to the ends of the row, Ctrl (or Cmd) with Home or End to the ends of the library, Page Up and Page Down a screen at a time. The tile holding the tab stop is always rendered.

## Elevation & Depth

Flat. Depth is tonal: white surfaces on a warm ground, tints for state, hairline borders where a surface meets the ground edge (tab bar). Box-shadow is used for the focus ring, the attention card's inset 2px amber border and the notice's inset 1px `line-strong` border. The soft `shadow-raised` token (sidecar) is kept for what genuinely floats or lifts: the Photos select bar while sticky above 720px; dialogs; the scrubber's date pill, and its grip on phones where it floats over the photos; and a photo tile while a mouse hovers it. A dialog also dims the page behind it with an `ink` backdrop at 45%. At rest, tiles, the upload panel, the viewer stage, the details card and every card stay flat.

### Named Rules
**The Flat Panel Rule.** Surfaces separate by tone, not by shadow. Introduce `shadow-raised` only for a surface that genuinely floats (a dialog, a sheet, the sticky select bar, the scrubber's pill) or as a hover response on a photo tile; never for a card at rest.

## Shapes

Soft, friendly rounding in four steps: 6px (`rounded.xs`) for photos only (timeline tiles, a checked tile's shrunk photo, the viewer photo, Trash thumbnails), so pictures read as pictures and not as cards; 10px for small chips and the default focus outline, 14px for the banner strip, sidebar cards, sidebar nav rows, inputs, notices, the pairing code panel, the delete sheet's option panel and the More link rows, 18px for content cards, the recovery key card, the attention card, the upload panel, the viewer stage, the details card, the Trash list card and dialogs (on phones only the sheet's top corners). Buttons, the skip link, meter, upload progress bar, tab icon pill, attention dot, video chip, the "This browser" badge, the scrubber's rail and date pill are full pills. The segmented control and the select bar are pills on one line that become rounded boxes (24px and 32px radius) when large text wraps them; a tile's select check, the hover select circle and the scrubber's grip are circles. Borders are 1px; the attention card's 2px amber border is the heaviest stroke. Icons are line icons on a 24-unit grid, 2px stroke, rounded caps and joins.

## Components

### Buttons
- **Shape:** full pill (`rounded.pill`), at least 48px tall, 20px side padding.
- **Primary:** safe green fill, white bold label; hover deepens to `safe-strong`. One per screen header.
- **Secondary:** white with a `line-strong` border, ink label; hover fills `surface-sunk`.
- **Ink:** `ink` fill and border, white semibold label; hover `ink-3`. For Move to Trash: firm, reversible, not red.
- **Quiet danger:** the secondary button with its label in `danger`. Where permanent deletion is offered: Delete forever on a Trash row, Empty Trash (with its trash icon) in the Trash header. It always opens a confirm dialog; it never deletes by itself.
- **Danger:** red fill, white label; only the final confirm of a permanent deletion ("Delete forever" in the confirm dialog).
- **Disabled:** 55% opacity, not-allowed cursor.
- **Busy:** the button that started the work is disabled and says what is happening ("Moving to Trash…", "Deleting…", "Restoring…").
- **Pressed / expanded:** a secondary button that toggles (Select, Favourite, Details) shows its state with an `ink` border via `aria-pressed` or `aria-expanded`; Favourite also fills its heart.
- **Icons:** always beside a word (the viewer's Previous and Next keep their words on every width); 18px in buttons.

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
A 40px line icon and the text in `ink-2`, a 22px `ink` heading ("No photos yet", "Trash is empty") and one sentence saying what happens next. The screen's primary action stays in the header row, not inside the empty state.

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
A white row (14px radius, at least 48px, 12px 16px padding, 12px gap): a 22px line icon, a semibold label with a tabular count ("Trash · 3"), and a 20px `ink-2` chevron at the end. Hover `surface-sunk`. Grouped in a `nav` labelled "More".

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
