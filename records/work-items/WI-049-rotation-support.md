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
5. **Multi-select "arrange into grid/flex" PRESERVES the rubber-band — the
   arranged union equals the selection band exactly (no grow, no collapse),
   idempotent.** `layout-arrange.ts`: the band (the selection's current
   outer-bounds union, in pixels) is divided into `cols × rows` equal
   RECTANGULAR cells (`cellW = bandW/cols`, `cellH = bandH/rows`); each item's
   outer bounds (AABB) fill its cell. Equal cells → equal footprints ("반반씩").
   A rotated item solves the 2×2 AABB system for the raw box that fills the
   cell; an exact-45° item in a non-square cell (unfillable — its AABB is
   always square) falls back to the largest inscribed square. Preview overlay
   shares the same function.
   - Evolution this session (user images 2026-05-29): cell = *largest
     footprint* GREW past the band → cell = `min(bandW/cols, bandH/rows)` SQUARE
     fit inside but COLLAPSED a wide flex row to a center strip → final =
     fill-the-band rectangular cells. The lesson: "유지(maintain) the band" means
     fill it exactly, not shrink-to-fit-square.

Verification: 230 weave unit tests, rotation e2e specs
(`rotation-pivot-reparent`, `rotation-hover-marquee-align`,
`rotation-layout-aabb`, `rotation-arrange-grid` — now 2 tests: grid
band-preserve/equal-halves/idempotent + flex no-collapse), 222 agocraft layout
tests, tsc clean, declarative + purity gates green.

## Deferred — BACKLOG (further fixes the user flagged + known limitations)

- [ ] **(User) Additional fixes pending — to be specified.** The user indicated
      more rotation fixes are needed beyond this checkpoint; capture details here
      when provided.
- [ ] **Persistent layout vs arrange inconsistency.** The persistent flex/grid
      layout uses *fit-within* (aspect-preserve into the track-proportional
      cell), whereas multi-select arrange now *fills* each band cell exactly. A
      rotated child therefore looks different depending on which path placed it.
      Decide whether to unify (likely: persistent layout should also fill in
      pixel space).
- [ ] **Exact-45° item in a non-square arrange cell.** A 45° item's AABB is
      always square, so it cannot fill a non-square cell — it falls back to the
      largest inscribed square (leaves slack on the long axis, and that single
      item is then non-idempotent: its smaller AABB shrinks the band on a
      re-press). Non-45° rotations fill exactly via the 2×2 solve. Only matters
      when a cell is non-square AND an item sits at ~45°.
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
