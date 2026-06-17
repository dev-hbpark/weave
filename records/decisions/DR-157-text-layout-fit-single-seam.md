# DR-157 — Single seam for "text fit when entering a layout container"

## Metadata

| Field | Value |
|---|---|
| ID | DR-157 |
| Date | 2026-06-17 |
| Owner | hbpark |
| Status | ACCEPTED |
| Work Item | text-fit ownership ([WI-051](../../../agocraft/records/work-items/WI-051-engine-text-measure-seam.md) follow-up) |
| Related | DR-156 (DOM-free sync shrink-to-fit), reparent-text-hug.ts, commands.ts (item.add / clipboard.paste / item.reparent) |

## Context

A TEXT can enter a layout container three ways — **add** (`weave.item.add`), **paste**
(`weave.clipboard.paste` → `clipboardPastePlaced`), and **reparent** (`weave.item.reparent`
+ dissolve). Each grew its OWN copy of the "measure the text → content-hug frame" logic:

- `reparent` → `reparent-text-hug.ts` (`reparentTextHugPatches`): measure + frame + policy.
- `paste` → inline block in `clipboardPastePlaced`: measure + seed frame.
- `add` → inline block in `item.add` (added latest): measure + seed frame.

Because the three were written separately they **drifted**: the operator reported
add-into-flex filling the slot (FULL_FRAME) while reparent-into-flex hugged. Each fix had
to be repeated per path (and add/paste were initially missed). The measure block itself
(font-px resolve against the right basis height, line-height unit derivation,
`measureFreeTextHugRatio`) is duplicated 3×, including the subtle parts that have bitten
before (CSS-var font family, ratio-font basis height).

## Decision — one module is the single source of truth; the three paths delegate

New module **`apps/web/src/document/layout/text-layout-fit.ts`** owns the two decisions:

1. **`textHugFrameRatio(attrs, containerBoxPx, fontBasisHeightPx)`** — THE shared measure:
   maps a text item's attrs → a `FreeTextHugSpec` (font px resolved against the caller-
   supplied basis height, line-height unit derivation, letter-spacing) and returns the
   content-hug frame as a parent-ratio via `measureFreeTextHugRatio`. The ONLY thing
   callers differ on — the font basis height — is a parameter (add/paste = the container
   box height; reparent = the OLD parent height, since a reparented ratio-font is
   preserved and must measure at its rendered px).
2. **`textHugChildPolicy(parentLayoutKind)`** — THE shared policy: `auto-flex` →
   `{grow:0, shrink:1, basis:"auto"}` (content-hug, no `crossSize` so the box hugs both
   axes and `engineHugged` keeps the render font-fit off); `auto-grid` → `undefined`
   (keep the engine's default cell `stretch`; the DOM-free render shrink-to-fit handles
   overflow per DR-156); free/absolute → `undefined` (frame-only hug).

The three paths call ONLY these — no path re-implements the measure or the policy:

- **reparent** — `reparentTextHugPatches` uses both (it already post-overrides; now via
  the seam).
- **add / paste** — pre-seed the staged frame via `textHugFrameRatio` (so the engine
  lays siblings out against the content size in one step) and apply
  `textHugChildPolicy` to the placed child, so the final `{frame, layoutChild}` matches
  reparent's.

## Consequence

- A future change to "how a text fits a flex/grid/free parent" is made **once** in
  `text-layout-fit.ts` and all three entry points move together — the operator's ask.
- The duplicated measure block (and its CSS-var / ratio-basis foot-guns) exists once.
- Grid is uniformly "box = cell + render font shrink-to-fit" across all three (no
  per-path font write — DR-156).

## Verification

- All three paths produce the SAME `{frame, layoutChild}` for the same text + parent
  (flex/grid/free), checked by a dev-server DOM dump across add / paste / reparent.
- Unit coverage for `textHugFrameRatio` / `textHugChildPolicy` (pure, fake measurer).
- weave suite green; live-verified add/paste/reparent into flex (hug) + grid (cell + font fit).
