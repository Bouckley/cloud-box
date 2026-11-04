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
rounded:
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
---

# Design System: Cloud Box

Source of truth: `web/src/styles/tokens.css` (values) and `web/src/styles/base.css` (components). Components use token names, never raw values. **Changing a token value needs the owner's approval and an update to this file.** Light theme only in M2 (owner decision, 2026-11-03); a dark set may later redefine the same names under one selector.

## Overview

**Creative North Star: "The Calm Appliance Panel"**

The frame exists to answer one question first and truthfully: are my photos safe? Everything else is quiet: a warm off-white ground, white rounded cards, deep ink text, line icons, and a single green that is spent only on safety and the primary action. Status is never buried in settings; it leads every main screen as the safety banner.

Density is low and targets are large, built for less confident, older users as much as for households leaving paid clouds. Surfaces are flat; meaning is carried by colour family, material change and words, never by decoration. Motion is short and quiet and disappears under reduced motion.

**Key Characteristics:**
- One green, one amber, one red, each with a single meaning.
- The safety banner changes material with the box's truth.
- Icon plus words, always; never colour alone.
- 48px minimum targets, a visible two-ring focus, WCAG 2.2 AA.
- Inter, 17px body, bold short headings.

## Colors

A warm neutral ground with three semantic hues, each reserved for one meaning.

### Primary
- **Safe Green** (`safe`): the only accent. Its fill means "safe" or marks the primary action (primary buttons, form `accent-color`). Its family supports it: **Deep Safe Green** (`safe-strong`) for primary hover, active nav text, links and caret; **Safe Mist** (`safe-tint`) for the safe banner, active nav pill and text selection; **Safe Ink** / **Safe Ink Soft** (`safe-ink`, `safe-ink-2`) for text on the tint.

### Secondary
- **Attention Amber** (`attention`) on **Amber Wash** (`attention-tint`), text in **Amber Ink** (`attention-ink`, `attention-ink-2`): only for "backup copy paused", "almost full" and "can't reach your box". Used as the attention card's 2px border and the Box tab's dot. `attention-strong` is reserved, not yet used.

### Tertiary
- **Delete Red** (`danger`): only for permanent deletion (danger button). `danger-tint` is reserved, not yet used.

### Neutral
- **Warm Paper** (`ground`): page background and sidebar.
- **White** (`surface`): cards, banner strips in copying and checking states, bottom tab bar, inputs, secondary buttons.
- **Sunk Paper** (`surface-sunk`): hover fill for buttons and sidebar items; code output.
- **Hairline** (`line`), **Firm Line** (`line-strong`): tab bar top border; button and input borders.
- **Meter Track** (`track`): unfilled storage meter.
- **Ink** (`ink`): primary text. **Ink Soft** (`ink-2`, 5.9:1 on ground): secondary text, inactive tabs, checking banner. `ink-3` is reserved for table and meta text.
- **Focus Green** (`focus`): the focus ring colour.

### Named Rules
**The One Green Rule.** Green means "safe" or "this is the primary action". Never use it decoratively, for categories or for brand flourish.

**The One Meaning Per Hue Rule.** Amber is attention (paused, almost full, unreachable) and nothing else. Red is permanent deletion and nothing else; moving to Trash is not red.

**The Never Colour Alone Rule.** Every status carries an icon and words with its colour. The active tab adds a shape (pill) to its colour; the attention dot is paired with the accessible name "Box, needs attention".

## Typography

**Body Font:** Inter Variable, self-hosted via `@fontsource-variable/inter` (fallback system-ui, -apple-system, Segoe UI, sans-serif). One family throughout; no display face.

**Character:** Plain, legible and warm; hierarchy comes from weight and size, not from a second family. Numbers are tabular everywhere so counts and sizes don't jitter.

### Hierarchy
- **Headline** (700, 30px, 1.15, -0.01em): the single `h1` each screen owns; solo pages (setup, unlock, errors).
- **Title** (700, 19px, 1.3): product name in the sidebar, the attention banner's title, section headings.
- **Body** (400, 17px, 1.5): all running text and inputs; sidebar nav items; banner title in safe and copying states (bold). Ledes cap at 62ch.
- **Label** (600, 15px): buttons (primary is 700), storage card label, banner detail line, field labels.
- **Label XS** (600, 13px, 1.2): bottom tab labels, capped at `min(13px, 5vw)` so four one-word labels never wrap; active tab is 700.

### Named Rules
**The 17 Rule.** Body text is 17px and is never set smaller for density. Text must scale to 200% with no sideways scroll at 320px.

## Layout

One breakpoint at 720px. Above it, a sticky left sidebar (264px) on the ground holds the product mark, the four nav items as rounded rows, and the storage card; the main column fills the rest (padding 20px 24px 32px). At or below 720px, the sidebar's mark and storage card hide and the nav becomes four fixed bottom tabs (72px plus safe-area inset), icon over label; main pads 16px 12px and leaves room for the tab bar. Inline padding on small screens is in px so 200% text keeps room for words.

The safety banner is always the first thing in `<main>`, full width. Each screen's header row puts the `h1` left and its primary action right, wrapping when narrow. Main stacks sections with a 20px gap. Spacing is a 4px-based scale. Single-task pages (setup, unlock, connect, errors) center one panel up to 34rem wide.

Widths 320 to 2560px are supported.

## Elevation & Depth

Flat. Depth is tonal: white surfaces on a warm ground, tints for state, hairline borders where a surface meets the ground edge (tab bar). Box-shadow is used only for the focus ring and the attention card's inset 2px amber border. A soft `shadow-raised` token is defined (sidecar) but no shipped surface uses it yet.

### Named Rules
**The Flat Panel Rule.** Surfaces separate by tone, not by shadow. Introduce `shadow-raised` only for a surface that genuinely floats (a sheet or menu), not for cards.

## Shapes

Soft, friendly rounding in three steps: 10px for small chips and the default focus outline, 14px for the banner strip, sidebar cards, sidebar nav rows and inputs, 18px for content cards and the attention card. Buttons, the skip link, meter, tab icon pill and attention dot are full pills. Borders are 1px; the attention card's 2px amber border is the heaviest stroke. Icons are line icons on a 24-unit grid, 2px stroke, rounded caps and joins.

## Components

### Buttons
- **Shape:** full pill (`rounded.pill`), at least 48px tall, 20px side padding.
- **Primary:** safe green fill, white bold label; hover deepens to `safe-strong`. One per screen header.
- **Secondary:** white with a `line-strong` border, ink label; hover fills `surface-sunk`.
- **Danger:** red fill, white label; permanent deletion only.
- **Disabled:** 55% opacity, not-allowed cursor.

### Cards / Containers
- **Content card:** white, 18px radius, 24px padding, no border, no shadow.
- **Storage card (sidebar):** white, 14px radius, 16px padding; label `{used} of {size} used` above an 8px pill meter (track `track`, fill `safe`). Hidden when status is unknown or unreachable. The fill width is set through the CSSOM.

### Inputs / Fields
- **Style:** white, 1px `line-strong` border, 14px radius, 48px tall, 17px text; label above in 15px semibold.
- **Focus:** border turns `focus` plus the focus ring.

### Navigation
- **Sidebar (above 720px):** rows 48px tall, 22px icon then 17px label, 14px radius. Hover `surface-sunk`; active (`aria-current`) `safe-tint` fill with `safe-strong` bold text.
- **Bottom tabs (720px and below):** white bar with a hairline top border; four equal cells, 24px icon over a 13px label. Inactive `ink-2`; active `safe-strong` bold with a `safe-tint` pill behind the icon. Focus is an inset 3px `focus` ring.
- **Attention dot:** a 12px amber dot with a 2px white ring on the Box icon, only in attention states (paused, almost full, unreachable), never for copying or checking. The link's name becomes "Box, needs attention".
- **Skip link:** ink pill with white bold text, off screen until focused.

### Focus
Every focusable element shows `--focus-ring`: a 2px white gap then a 3px `focus` green ring (box-shadow, since outlines are removed). It is never removed. Elements that set their own box-shadow (the attention banner) restate the ring alongside it.

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

### Don't:
- **Don't** use green for anything but "safe" or the primary action.
- **Don't** show green or the word "safe" while checking, copying or in any attention state.
- **Don't** use red for anything but permanent deletion, or amber for anything but paused, almost full or unreachable.
- **Don't** use inline `style` attributes or injected `<style>`; the CSP blocks them.
- **Don't** show the Box attention dot for copying or checking.
- **Don't** let tab labels wrap or shrink body text below 17px.
