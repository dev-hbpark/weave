# WI-049 — Rotation support (handle, reparent, alignment, layout, arrange)

Status: **In progress — checkpoint committed; further fixes deferred (backlog below).**
Owner: hbpark
Updated: 2026-05-29

## Problem

Item rotation had several broken/missing behaviors across the editor. Reported
by the user and addressed incrementally this session.

## Done (committed checkpoint)

1. **Rotation handle pivots around the item's visual center.** The gesture
   pivot (`centerViewportOf` in `FrameStage.tsx`) read stage-local (camera)
   coords while the router feeds client coords — the pivot sat off by the
   stage's on-screen offset, so dragging tracked vertical motion. Fixed by
   reading the rendered element's client-rect center.
2. **Reparent preserves the on-screen rotation of the item AND its subtree.**
   `computeReparentFrameRatio` + `absoluteFrameTransform` (`agocraft-mirror.ts`)
   compose ancestor rotations as 2D affine matrices to keep the visual center +
   angle fixed; children follow because they are relative to the item. Host
   passes design pixel size for correct rotated/non-square ancestors.
3. **Align / marquee / hover use the rotated item's outer (AABB) bounds.**
   `align-ops.ts` aligns by AABB; `FrameStage` marquee hit-tests the AABB;
   hover overlay was already rotation-aware.
4. **Persistent flex/grid layout fits a rotated child's AABB into its cell**
   (agocraft `@agocraft/layout` `adapters/aabb-fit.ts`, vendored into weave as
   `@agocraft/layout@1.0.0-rc.20260529075300`).
5. **Multi-select "arrange into grid/flex" places rotated + unrotated items as
   equal squares (in PIXELS), idempotent.** `layout-arrange.ts` rewritten to
   compute uniform square cells in pixel space (rotation is isotropic in pixels,
   not the non-square 0..1 ratio space). Preview overlay matched.

Verification: 224 weave unit tests, 7 rotation e2e specs
(`rotation-pivot-reparent`, `rotation-hover-marquee-align`,
`rotation-layout-aabb`, `rotation-arrange-grid`), 222 agocraft layout tests,
tsc clean, declarative + purity gates green.

## Deferred — BACKLOG (further fixes the user flagged + known limitations)

- [ ] **(User) Additional fixes pending — to be specified.** The user indicated
      more rotation fixes are needed beyond this checkpoint; capture details here
      when provided.
- [ ] **Persistent layout vs arrange inconsistency.** The persistent flex/grid
      layout uses *fit-within* (aspect-preserve into the track-proportional
      cell), whereas multi-select arrange uses *square-cell fill*. A rotated
      child therefore looks different depending on which path placed it.
      Decide whether to unify (likely: persistent layout should also reason in
      pixel space / fill).
- [ ] **Non-45° rotated items in arrange.** Square-cell fill forces a rotated
      item's raw box to a square (distorts a non-square item). Only 45° + square
      items fill exactly. Consider per-item aspect handling.
- [ ] **Arrange preview ghost** draws the AABB box but not the rotated outline
      (cosmetic mismatch with the applied rotated item).
- [ ] **Reparent design-dims coverage.** `computeReparentFrameRatio` needs the
      design pixel size for rotated/non-square ancestors; verify *every* reparent
      surface passes it (currently: ContextMenu picker + modifier-drag
      controller). ThumbnailPanel drop / any future surface must too.
- [ ] **Layout children `canRotate: false`** (Figma auto-layout parity) — a
      rotated child can only enter a layout via reparent-in / arrange /
      rotate-then-setLayout, not the handle. Revisit if direct rotation is wanted.

## Environment notes (not code)

- iCloud "Optimize Storage" evicts `node_modules` files (yjs `dist/src/*.d.ts`)
  → recurring tsc `TS7016` on the 3 yjs importers; fix: `pnpm install`. Consider
  excluding the repo from iCloud optimization.
- iCloud also generates `<name> 2.ts` / `package 2.json` sync-conflict copies of
  edited files that pollute the TS build; sweep with `find -name "* 2.*"`.
