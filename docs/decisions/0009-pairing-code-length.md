# ADR 0009: Pairing code stays long in M2

Date: 2026-11-04 · Status: Accepted (owner, 2026-11-04)

## Context

Box › Add a device shows a single-use pairing code: 32 random bytes,
base64url-encoded (`auth.CreatePairingCode`), valid for 10 minutes
(`PairingTTL`) and stored only as a hash. That gives 43 case-sensitive
characters, shown in groups of four with a QR beside them. The code can hold
both `0` and `O` and the symbols `_` and `-`. The M2 finish review flagged it
as a lot to type by hand on a second browser, especially for the less
confident people the product is built for.

A shorter code (say 8–12 characters from an alphabet with no look-alike
letters) is easier to type. But with fewer bits, an attacker on the LAN could
guess it inside the 10 minutes. To stay safe it needs per-code attempt limits
or rate limiting on `POST /v1/devices/pair`, an API change, and a security
review of the pairing flow from ADR 0004.

## Decision

- **M2 keeps the 43-character code.** It is unguessable without any rate
  limiting, and the QR covers the phone app (M3), which scans rather than
  types.
- **Revisit with M8 (rate limits) or earlier if owners struggle.** Options
  then: a short code from a look-alike-free alphabet (no `0/O`, `1/l/I`,
  no symbols) with a per-code attempt limit, or a short code plus a
  confirm-on-the-old-device step.

## Consequences

- Pairing a second *browser* by typing stays slow and error-prone. People can
  copy and paste the code when both browsers are on the same computer, or
  read it out in groups of four.
- No API or crypto change in M2.
