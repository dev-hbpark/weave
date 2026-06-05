# Engineering Plan — Per-range typography generalization — WI-093

| Field | Value |
|---|---|
| Triggering WI | WI-093 |
| Decision | DR-062 (extends DR-060) |
| FR | FR-019 = FEASIBLE WITH TRADE-OFFS |
| Owner | hbpark |
| Status | In Progress (single-session, 2026-06-05) |

## 1. Change surface

| # | File | Change |
|---|------|--------|
| A | `apps/web/src/document/active-text-style.ts` (new, supersedes `active-text-outline.ts`) | General `ActiveTextStyle` bridge: `setStyleProp` / `toggleFormat` / `setOutline` / `clearOutline` / `read()`. Module singleton + `useActiveTextStyle` hook. Keeps DEV global, renamed `__weaveActiveTextStyle` (back-compat alias `__weaveActiveTextOutline` kept for the migrated e2e until removed). |
| B | `apps/web/src/document/range-style-registry.ts` (new) | `RANGE_STYLE_PROPS` table (Rule 6 single branch point): `color / fontSize / fontFamily / letterSpacing / textCase` as CSS-declaration props with `toCss` / `fromCss`. Shared by bridge, `nodeToAttributes`, seed. |
| C | `apps/web/src/document/domains/LexicalTextEditor.tsx` | Replace `OutlineBridgePlugin` with `TextStylePlugin`: registers the general applier; `SELECTION_CHANGE_COMMAND` listener snapshots the last non-collapsed range; appliers restore it before patching. `nodeToAttributes` + seed iterate the registry. |
| D | `apps/web/src/document/domains/TextBlock.tsx` | Mark the editor surface `data-dismiss-exempt="true"` + a stable `data-weave-text-editor` hook. (renderReadOnly unchanged.) |
| E | `apps/web/src/document/toolbar/sections/text-section.tsx` | Route color / size / family / 꾸밈 / 대소문자 / 자간 / outline / B-I-U to the bridge when `activeStyle !== null`; display from `activeStyle.read()` (mixed→badge) while editing. |
| F | `packages/design-system/src/components/Popover.tsx` (+ `lib/use-dismiss-on-outside-pointer.ts` already exempts) | `PopoverContent` honors `data-dismiss-exempt` for Radix `onInteractOutside` (covers focus + pointer outside). |
| G | e2e + unit | Migrate DR-060 spec to a real-UI spec; add registry round-trip unit + Popover-exempt unit. |

## 2. SOLID + GRASP checklist (per CLAUDE.md core principle)

- **Rule 6 (no `switch`/if-else on a discriminant):** branching over "which
  property" lives ONLY in `RANGE_STYLE_PROPS` (one row per prop). The bridge,
  read-back, and seed all *iterate* it. Format props (bold/italic/underline/
  strike) use Lexical's native command — not a `switch`, a registry of
  `{ format, cssOnReadback }`. ✅
- **SRP:** bridge = "apply/read style to the live selection"; registry = "the
  attr↔CSS mapping"; toolbar = "intent + display"; Popover = "dismiss policy".
  No file owns two of these. ✅
- **OCP:** new per-range property = new registry row; no edit to bridge/seed/
  read-back logic. ✅
- **Producer/consumer (CLAUDE.md):** the bridge is the producer of a selection
  readout; it emits on selection-change; the toolbar (consumer) chooses its own
  render cadence via `useSyncExternalStore`. No consumer policy pushed into the
  editor. ✅
- **DIP / closer-wins:** bridge is a module singleton resolved by `itemId`
  (instance lookup), separate from the property registry (data×behavior). ✅
- **Serialization round-trip identity:** every registry prop round-trips
  attr→CSS→attr; unknown CSS declarations on a node are preserved by leaving the
  node style string otherwise untouched (`$patchStyleText` merges, not replaces).
  ✅

## 3. Continuous Self-Verification loop

After each of A–F: `pnpm typecheck` + targeted unit; after C/E: drive the real
editor in a browser (playwright) — select sub-range, apply each prop, assert the
in-range run only; after F: assert the More popover stays open across a slider
drag. Suite must be green before declaring done (SVL gate).

## 4. Decommission Sweep

- `active-text-outline.ts` is removed once all references move to
  `active-text-style.ts` (DR is kept — DR-060 stays Accepted/subsumed).
- The bridge-only DR-060 e2e (`text-outline-per-range.spec.ts`, drives
  `__weaveActiveTextOutline`) is migrated to the real-UI spec, not left in
  parallel. Behavior moved → coverage moves with it.
