# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

One shared Cloud Box look across the web app (M2, React + Vite, served by the
box) and the phone app (M3, Expo for iOS and Android). The phone app reuses the
same tokens and components and adds only small native touches. It does not
switch to iOS HIG or Material styling per OS.

## Users

Two audiences, weighted equally. When they pull in different directions,
simple mode and the helper role are how both get served. Neither audience wins
by default.

- **Less confident, older users.** The first one is the owner's mom, who gets
  the gift box at M6. Research on adults aged 60–75 found three main barriers:
  fear of making mistakes, anxiety when apps lag, and relying on family for
  setup. Her jobs: back up phone photos without thinking about it, look at
  them, and trust that they are safe.
- **Households replacing paid cloud plans,** plus privacy-minded professionals
  (lawyers, therapists, journalists) and small offices of 2–25 people. Their
  jobs: move off iCloud, Google One or OneDrive, keep photos and files
  private, and stop paying monthly.
- **Family helper** (secondary role). A trusted person, such as the owner
  helping their mom, who keeps the box healthy (status, updates, backups)
  but can never see photos, not even thumbnails.

## Product Purpose

A small box at home that stores photos and files, encrypted on the user's
devices before they leave, with no monthly fee. It replaces iCloud, Google
Photos/Drive and OneDrive for people who want to own their data.

Success means the user can always tell, truthfully, that their photos are safe;
nothing is lost by mistake; and the box keeps working without the owner
needing technical help.

## Positioning

Zero-knowledge encryption combined with appliance-level simplicity, bought
once. Big clouds read your data and charge monthly. Home NAS boxes (Synology,
UGREEN) are no-subscription but are built for tinkerers. Privacy clouds (Ente,
Proton Drive) encrypt but still charge monthly. "Private and pay once" is open
ground.

The product answers six failures the research found in the big services:

1. storage pressure used as the business model;
2. sync mistaken for backup;
3. silent backup failures;
4. cleanup left to the user;
5. features and account locks the user can't control;
6. less confident users left behind.

## Operating Context

- **Setup:** plug the box in at home, press its power button (setup only opens
  within 10 minutes of a press), create the owner account in the browser, and
  record the 24-word recovery key. Each browser or phone is a paired device.
  A new browser joins with a pairing code from Box › Add a device.
- **Daily use:** the phone backs up automatically (M3). The web app is for
  big-screen browsing, files, uploads and box settings. Both clients unlock
  with a password on every load; nothing decrypted is kept in the browser.
- **Network:** home Wi-Fi only until M8 adds remote access. The web app served
  from the box shows a one-time certificate warning until then.
- **Navigation:** four fixed tabs (Photos, Albums, Files, Box) with the safety
  banner on every main screen. Settings live only under Box.
- **Physical box:** status light and power button on the front, plus a
  backup drive that gets a nightly copy.

## Capabilities and Constraints

- **Zero knowledge.** The box stores ciphertext only. Thumbnails, search,
  timeline, map and duplicate detection run on the client. No feature may need
  the server to read content, names, dates, locations or keys.
- **Safety status is truthful.** An item counts as "safe" only when it is
  stored, hash-verified and on the backup copy. The UI never claims more than
  the box reports.
- **Deletes go to Trash** for 30 days. Permanent deletion happens only from
  Trash or the purge, and only after a confirmation. On the phone, the default
  delete is "Remove from this phone only"; the web's delete sheet offers Move to
  Trash or Cancel, with Cancel focused.
- **Free up phone space** removes only photos already confirmed safe. The box
  copy is never touched.
- **Recovery** works only through the 24-word recovery key. The maker cannot
  reset passwords or recover data, and the UI must say so plainly.
- **No upsell nags, no tracking, no telemetry.** Honest capacity ("years of
  space left at your pace") arrives at M4.
- **Export everything** to USB is always allowed. Expansion may be locked to
  company modules, but data export never is.
- **Terminology:** "safe", "box", "backup copy", "Trash", "recovery key",
  "device", "helper". Use plain words: "Your photos are safe", not "Sync
  complete".
- **Exact UI copy** for the banner states, delete sheet, Trash rows, recovery
  screen and wrong password is fixed in `docs/plans/M2.md` (Copy table) and
  asserted by tests.
- **Scope by milestone:** see `docs/10-roadmap.md` and `docs/12-app-ui.md`.
  Simple mode is phone-only (M3). Sharing is M7, the cleanup assistant M10,
  search, map and people later.
- **Undecided:** people search (on-device, a bigger box, or skip); whether the
  Files tab ships in the mom version; helper limits beyond "never sees photos".

## Brand Commitments

- **Name:** "Cloud Box" is a working name, used in the UI for now. The final
  name is undecided.
- **Positioning line:** "Your own cloud. Encrypted so even we can't see it.
  Pay once." is a draft, not binding.
- **Voice:** plain, calm, short sentences. Say what happened and what to do.
  No jargon, no alarm, no pressure to buy.
- **Existing tokens** in `docs/12-app-ui.md` (safe green, attention amber,
  danger red, Inter, 17 pt body) are prior design work, recorded there rather
  than here.

## Evidence on Hand

- UI research with sourced competitor complaints:
  https://claude.ai/artifact/4xm47UnmYpwuzTBAuMHLRP
- Product spec and business model:
  https://claude.ai/artifact/WpmeVS9pAgPRuJScVV4JBS
- 12-screen UI designs: https://claude.ai/artifact/2x7YjedtSmPE9Hb5uqZ1Ly
- Hardware concept: https://claude.ai/artifact/S2WtAEiZTP3YnBimVMfoVs
- **Not on hand, so never fabricate:** customer testimonials, user counts,
  reviews, press, security audit results, final prices (spec prices are
  untested assumptions), and real capacity figures. "12,480 photos" and
  "3 years left" are placeholders showing tone only.

## Product Principles

1. **Safety you can see.** Every main screen says, in plain words, whether
   the user's photos are safe. When that stops being true, say why and what to
   do.
2. **Nothing lost by mistake.** Destructive actions are reversible by default,
   explicit when they're not, and never confuse "this device" with
   "everywhere".
3. **Private without effort.** Encryption is invisible in daily use and
   never weakened for a feature. If the box would need to read something, do
   it on the device.
4. **Calm over clever.** Predictable fixed navigation, no surprise pop-ups, no
   time limits, no nagging. Designed for someone afraid of breaking things.
5. **The user owns it.** No lock-in on data, no subscription pressure, and
   help comes from family through the helper role, not the vendor.

## Accessibility & Inclusion

- WCAG 2.2 AA across web and phone, verified by axe in Playwright.
- Touch targets of at least 48 × 48 pt. Every control has a label, and icons
  always appear with words. No hidden menus for core actions.
- Text scales to 200% without clipping. Simple mode (phone) uses 20 pt body
  text and shows only the Photos and Albums tabs.
- Every action works without gestures. Respect Reduce Motion. Status never
  relies on colour alone: it uses colour, an icon and words together.
- Screen readers announce photos with their date and place, e.g. "Photo,
  4 July 2026, Toronto".
- Undo after actions. Confirmations only for permanent deletes. No
  auto-dismissing errors.
- Test with real less-confident users (including the owner's mom) before each
  release.
