# DR-068 — Audit + close gaps so every item attr / unit reaches the agent

- **Date:** 2026-06-05 · **Status:** Accepted · **WI:** WI-099
- **Relates:** DR-059 (text outline), DR-060 (per-range outline), DR-061 (item
  lock), WI-074/DR-029 (image crop, flip), WI-058 (QR), DR-067/WI-098 (chart),
  DR-064/WI-095 (command/description coverage)
- **Operator directive (2026-06-05):** the text OUTLINE looked missing — audit
  whether EVERY attr and EVERY unit of EVERY item is conveyed to the agent.

## Context

Audited the agent-facing guidance (`WEAVE_CAPABILITIES.itemKinds` editableAttrs +
descriptions, `unitKinds`, and the command-schema notes) against the authoritative
attr surface (`domain-kinds` `defaultAttrs` per kind) and the registered unit /
behavior set. Gaps found:

- **text**: `textOutline` (외곽선, DR-059 whole-item) MISSING entirely (the flag);
  `textOverflow` and `hyperlink` MISSING. (Per-range outline was already in the
  textRuns note.)
- **image**: `cropRatio` not advertised.
- **video**: `volume`, `playbackRate`, `borderRadius` not advertised.
- **qr**: NO `qr` itemKind in capabilities at all (only a command-schema note).
- **chart**: covered by DR-067.
- **every item**: `locked` (DR-061) undocumented.
- **units**: `transform.flip` not in `unitKinds` (only in the command EDIT_UNITS
  note). (Decoration ×5 + behaviors ×4 were present; hover-effect/entrance-animation
  are unregistered types → correctly absent.)

## Decision

Close every gap and make the audit permanent:

1. **text** — add `textOutline { color, width }`, `textOverflow`, `hyperlink` to the
   capability (description + editableAttrs) and to `TEXT_ATTRS_NOTE`.
2. **image** — add `cropRatio`; **video** — add `volume` / `playbackRate` /
   `borderRadius`.
3. **qr** — add a full `qr` itemKind (data / ecLevel / foreground / background /
   margin / moduleStyle / opacity).
4. **locked** — document the universal flag in `WEAVE_DOMAIN_KNOWLEDGE` rule 6.
5. **transform.flip** — add to capabilities `unitKinds`.
6. **Guard test** `weave-capabilities.coverage.test.ts`: for EVERY known domain
   kind, assert (a) it has a capability itemKind, and (b) every seeded attr
   (`defaultAttrsFor`) is in that kind's `editableAttrs` — minus an explicit SKIP
   set (`locked` universal; legacy text aliases `textAlign`/`lineHeight`/
   `textTruncation`/`maxLines` superseded by the canonical fields). A newly-seeded
   attr that isn't advertised now fails CI.

## Consequences

- (+) The agent can use text outline (whole-item + per-range), overflow, links,
  image crop, video volume/rate/radius, QR styling, item lock, and flip — the full
  editable surface, with no silent omissions.
- (+) The coverage guard prevents future attr drift.
- (−) Larger cached prompt (qr itemKind + more attr lines); kept concise.

## Verification (SVL gate)

`@weave/web` typecheck clean; aku-agent suites pass incl. the new attr-coverage
guard (9 cases — every kind has an itemKind; every seeded attr advertised); biome
clean on changed files.
