# DR-063 — Wire the agent surface to partial text-run + chart edits (non-destructive item.update)

- **Date:** 2026-06-05 · **Status:** Accepted · **WI:** WI-094
- **Relates / extends:** DR-062 + WI-093 (per-range typography — editor-only),
  WI-092 + DR-055 (chart direct-manipulation — editor-only), DR-057 (`textRuns`
  single source of truth), DR-037/DR-035 (chart `overrides`/`variant`), WI-062
  (`normalizeShapeAttrs` partial-subAttrs precedent), WI-054 (declarative agent
  `attrs` surface)

## Context

WI-093 (per-range typography) and WI-092 (chart direct-manipulation) shipped rich
PARTIAL editing — style one text range, emphasize one bar, toggle one variant
flag — but **only through the editor UI** (Lexical bridge, drag handles, toolbar).
The Aku agent edits the same document through `weave.item.update { attrs }`
(declarative, JSON), and that surface was never wired to those features. Two
concrete gaps (operator concern, 2026-06-05 — "텍스트 부분편집과 차트아이템의
부분편집을 잘처리하도록"):

1. **Text.** `textRuns` (the canonical inline content + per-range style since
   DR-057) is absent from the agent capabilities and command schema, so the agent
   cannot do 부분편집 at all. Worse: on an item that already has `textRuns` (any
   user-edited text), a declarative `attrs:{ text }` edit is **silently ignored**
   — `getPlainText`/`renderReadOnly` read `textRuns` first, and the shallow merge
   left the stale runs in place.

2. **Chart.** `weave.item.update` shallow-merges `attrs` at the top level only, so
   a partial `variant` / `encoding` / `overrides` **replaces the whole key**,
   dropping the sibling flags / channels / per-element emphasis the agent didn't
   resend (it holds only the delta). The editor avoids this by using the
   imperative `patch` form (WI-092 후속2 merges `prev.variant`) — a path the agent
   cannot use over JSON.

`PartialTextStyle` / `TextRun` and `ChartOverrides` / `ChartVariant` already exist
and round-trip; the missing surface is entirely the agent command + schema wiring
plus a merge-safety guard on the declarative path.

## Decision

A single **per-kind attrs normalizer registry** applied to the merged `after` of
`weave.item.update` (a registry, not a `switch` on `child.kind` — Rule 6),
generalizing the existing shape-only `normalizeShapeAttrs` site:

- **`text`** — keep `text` ↔ `textRuns` coherent on the DECLARATIVE path:
  setting `textRuns` syncs `text` to the joined inserts; setting `text` alone
  re-derives `textRuns = [{insert:text}]` (so a whole-text rewrite actually shows
  on a runs-canonical item and intentionally resets per-range style). The UI
  `patch` form (which writes both itself) is detected by `provided === undefined`
  → no-op.
- **`chart`** — deep-merge ONLY `variant` / `encoding` / `overrides` back from the
  current attrs (recursing into the `overrides.datum` / `overrides.series` maps),
  so a partial edit is non-destructive; a `null` value clears a key. Everything
  else (frame, chartType, `palette[]`, barWidth, …) keeps wholesale-replace.
  Idempotent for complete input → safe on the UI path too.
- **`shape`** — unchanged (`normalizeShapeAttrs`), now reached via the registry.

Agent schema wiring (so the agent knows the surface exists):

- `WEAVE_CAPABILITIES.text` — `textRuns` added to `editableAttrs` + a PER-RANGE
  STYLE paragraph (run shape, canonical semantics, read-then-resend recipe).
- `weave-command-schemas.ts` — `TEXT_ATTRS_NOTE` gains the `textRuns` form;
  `CHART_ATTRS_NOTE` + the `weave.item.update` note state that `variant` /
  `encoding` / `overrides` are deep-merged (send only the delta; `null` clears).

## Scope (edits)

- `apps/web/src/document/commands.ts` — `deepMergePreserve`, `normalizeChartAttrs`,
  `normalizeTextAttrs`, the `ATTRS_NORMALIZERS` registry; `computeAttrsPatches`
  routes through it.
- `apps/web/src/features/aku/agent/weave-capabilities.ts` — text `textRuns`.
- `apps/web/src/features/aku/agent/weave-command-schemas.ts` — text/chart notes.
- `apps/web/src/document/commands.test.ts` — 7 new cases (WI-094 block).

## Consequences

- (+) The agent can now style a text range, emphasize one chart element, or
  toggle one variant flag without wiping siblings — parity with the editor UI.
- (+) Whole-text agent edits stop being silently dropped on runs-canonical items.
- (+) Rule-6 registry; adding a kind's partial-edit rule is one table row.
- (−) Deep-merge means the agent clears a chart override key with an explicit
  `null`, not by omission — documented in the note.
- (−) Per-range `fontSize` stays px-only for the agent too (ratio needs a
  per-parent denominator, undefined per-character) — same trade-off as DR-062.

## Verification (SVL gate)

`@weave/web`: typecheck clean; `commands.test.ts` 93 pass (incl. 7 new),
aku schema + range-style suites 20 pass. biome clean on changed files. Rule-6
gate: 3 pre-existing hits only (`derive-text-auto-resize.ts`,
`use-weave-editor.ts`, `PresentPage.tsx` — see WI-093), none introduced here.
