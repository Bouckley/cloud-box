---
version: 1
slug: "web-src-screens-setup-setup-tsx"
primary_target: "web/src/screens/setup/Setup.tsx"
related_targets: ["web/src/screens/Unlock.tsx","web/src/screens/Forgot.tsx","web/src/screens/Connect.tsx"]
---

# Surface brief: setup, unlock, forgot and connect

## Scope and mode

Operate. The single-task pages a browser sees before it is unlocked: first-time
setup (press the button, password, name this browser, recovery key, check two
words, creating), Unlock, Forgot password, Connect (pairing code) and the
recovery Reset. They sit outside the shell, in the centred `.solo` column, with
no banner and no nav. Light theme only in M2. Copy and behaviour are fixed by
the M2 plan (Task 12 Interfaces and the Copy table) and win any conflict.

## Audience, job, action

- Less confident, older users, often with a family helper beside them; and
  households moving off paid clouds. Research names their fears: making a
  mistake, being rushed, and losing everything if a step goes wrong.
- Job: set the box up once without fear, and write down the one thing that
  can get them back in (the 24 words). Later: get back in (unlock), or recover
  when the password is forgotten or every device is lost.
- Action per page: exactly one primary button. Back is always available until
  the box has been told anything; nothing is sent before the two words check.

## States each page must carry

- Setup: button not pressed yet (waiting, polls every 2 s, no countdown);
  pressed (moves on by itself); password errors (`Use at least 10 characters.`,
  `The passwords don't match.`); recovery key shown; wrong word in the check
  (names which word); creating (`Setting up your box…`, aria-busy); a box
  error while creating (what happened and what to do, words stay the same).
- Unlock: idle, working (Argon2id takes a second or two: button says so and
  is disabled, never a spinner alone), wrong password (`That password isn't
  right.` tied to the field), box unreachable.
- Forgot: words parse errors (`Word {i} isn't a recovery word.`, `Enter all 24
  words.`), wrong box (`Those words don't match this box.`), password errors.
- Connect: code, device name, password; revoked notice (`This browser was
  removed from your box.`); expired or wrong code; reset form with its warning
  and the `I understand` checkbox.
- No time limits, no auto-dismissing errors, errors stay until the field
  changes.

## Ranges

- Widths 320–2560 CSS px; 200% text with no sideways scroll at 320 px.
- Words: 3–8 letters each; 24 of them; typed with any case, spaces and line
  breaks, or 4-letter prefixes.
- Browser names up to ~40 characters (`Chrome on Linux`, `Safari on iPhone`).

## Layout intent

One centred column (max 34 rem) on the page ground, product mark at the top,
the h1, one short lede, the form, then the action row: primary button (full
width on phones, left-aligned on desktop), Back beside it, and `Step {n} of 5`
as quiet text at the row's end during setup (never an eyebrow above the h1). The recovery key is the one place that gets a white card: 24
numbered words in an ordered list, 3 columns on desktop, 2 on phones, numbers
in `ink-2` tabular figures, words bold and large enough to copy by hand. Print
shows only the product name, the heading and the 24 words.

## Direction contract

THESIS: Setup is a calm, unhurried conversation, one question per page; it
refuses the account-creation wall of many fields, timers and fine print.

OWN-WORLD: The shell's world from DESIGN.md: warm ground, white card only for
the recovery key, ink text, one green for the primary button, amber only if
the box is unreachable, Inter 17 px body, line icons beside words.

STORY: Press the box's button, choose a password, name this browser, write
down 24 words, prove two of them, and land on an empty Photos page that says
what to do next.

FIRST VIEWPORT: Product mark, step line, h1, one sentence of why, the single
input or the word card, the primary button above the fold at 1440 and 390.

FORM: Inherited from the shell. Signature: the recovery-key card, a printed
list that reads like a document you keep (printed: "Cloud Box recovery key",
the 24 words, "Made on" and "Kept at"), not a UI widget. seed: none
(deliberately not rolled): no concept roll, because the plan pins every step, string and
order, and new-work §3 says never to run the script for a precisely specified
narrow request.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict and DESIGN.md updated with the solo, form, error and word-card components

## Unresolved

- Copy for a wrong word in the check (proposal: `Word {i} doesn't match.
  Check what you wrote down.`) and for a checksum failure in Forgot (proposal:
  `Those words don't match this box.`), since the Copy table names neither.
