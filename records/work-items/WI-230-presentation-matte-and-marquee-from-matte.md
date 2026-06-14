# WI-230 — Presentation (slide-deck) mode: marquee can't start outside the page, and the gray matte breaks on zoom-out

## Metadata

| Field | Value |
|---|---|
| ID | WI-230 |
| Date | 2026-06-15 |
| Owner | hbpark |
| Status | DONE (fix + regression e2e) |
| Type | Bug fix (canvas — page-bounded editing surface) |
| Decision | [DR-145](../decisions/DR-145-matte-on-container-and-marquee-gate-split.md) |
| Related | WI-153 (page-bounded editing, P4 matte/clamp), WI-163 (page = artboard), WI-166/DR-114 (EditorModeContext policies) |

## Problem

Two distinct bugs in **slide-deck** flavor (the page-bounded "presentation" editing
mode), neither present in **mixed** (infinite canvas):

1. **A multi-select marquee could not START outside the page.** Editing/placement is
   correctly page-bounded, but a marquee drag is selection-only — the user expects to
   begin it on the matte (gray area outside the page) and sweep onto the page, the
   standard Figma/Canva gesture. It was blocked.

2. **The gray matte "broke" on zoom-out.** Zooming out far exposed the canvas behind
   the matte — the gray region shrank to a square and the design background (white)
   showed around it. Mixed mode never showed this because it has no matte.

## Root cause

Both live in `apps/web/src/pages/FrameStage.tsx`.

1. The marquee (`MarqueeSelectionLayer`) and the rubber-band drag-to-add
   (`RubberBandLayer`) shared a single `acceptTarget` predicate (`emptyRegionAccept`)
   that included the `acceptWithinPage` gate (WI-153 P4). That gate is correct for the
   rubber band (placing a new item on the matte would resolve the container to a stray
   ROOT frame = an accidental new page) but wrong for the marquee, which places nothing.

2. The matte was a `box-shadow: 0 0 0 100000px var(--canvas-matte)` on the **design
   plane** — the element that carries the camera `scale` transform. Effective on-screen
   spread = `100000px × totalScale`. `ACTIVE_PAGE_CAMERA.clampPan` is `freePan`
   (identity), so wheel zoom can shrink `scale` without bound; below ~`viewport/100000`
   the shadow no longer covered the viewport. The design plane is transparent and a
   fill-less page frame paints `transparent` (`FrameBlock`), so the page interior was
   actually showing the OUTER container's `background` — which is why the box-shadow had
   to be the only gray.

## Fix

`apps/web/src/pages/FrameStage.tsx`:

1. **Split the accept predicate.** `emptyRegionBase` keeps the idle gate + "not on a
   frame child". `marqueeAccept = emptyRegionBase` (may start on the matte);
   `rubberBandAccept = emptyRegionBase && acceptWithinPage` (placement stays in-page).
   The existing matte hit-test scoping (`getFrames` → active page's direct children) is
   unchanged, so a matte-started marquee selects in-page items correctly.

2. **Move the matte to the un-scaled outer container.** In page-bounded mode the OUTER
   `frame-stage` container paints `var(--canvas-matte, #6f737b)` (never scaled → covers
   the viewport at any zoom). The design plane keeps `overflow: clip` for the page edge
   but drops the box-shadow. A paint-only `background` backstop rect is added inside the
   design plane so a fill-less page still shows `design.background` over the page box
   (a per-slide `decoration.fill` paints on top in `planeChildren`). Mixed/infinite
   canvas is untouched (`pageChrome` false → outer keeps `background`, no backstop).

## Verification

- `apps/web`: `tsc --noEmit` clean; `editor-mode` unit suite 111/111.
- `apps/web/e2e/page-artboard.spec.ts` — 10/10 green, including 3 new tests:
  - *marquee STARTED ON THE MATTE (outside the page) still selects in-page items*
  - *page-bounded matte is painted on the un-scaled container so zoom-out can't break it*
    (asserts `frame-stage` bg = matte gray, design plane box-shadow = `none`)
  - *mixed (infinite canvas) keeps the design background, never the matte*
- The marquee-select / multi-marquee e2e failures observed are a **pre-existing
  sandbox baseline** (confirmed by re-running with the change stashed: identical
  failures), unrelated to this change.
- No agocraft change → no re-vendor (all touched code is weave `apps/web`).
