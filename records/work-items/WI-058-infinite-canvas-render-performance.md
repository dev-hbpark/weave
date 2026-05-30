# WI-058 — Infinite-canvas render performance (viewport culling + image raster cap)

Status: **Phase 1 in progress (viewport culling + image decode deferral).**
Owner: hbpark
Updated: 2026-05-30

## Problem

On the infinite canvas (`infiniteCanvas` flavor), zooming in/out drives a single
outer `transform: scale()` on the design plane that holds the **entire**
document. Two consequences (see `records/rendering-reviews/RPR-001-infinite-canvas-zoom-render.md`):

1. **No culling.** Every frame — including ones panned/zoomed far off-screen —
   keeps a painted, composited layer (and, for images, a GPU texture). Zooming
   in on a large document inflates GPU/layer memory without bound.
2. **Images drawn too large.** An `<img>` fills its frame at design-pixel size;
   the outer scale re-rasterizes that layer at `designPx × totalScale`, so a
   single zoomed-in image can demand a multi-thousand-px texture (can exceed
   `max-texture-size` → tiling / fallback / memory blowup). This is the user's
   reported symptom ("이미지를 너무 크게 그리려고 시도").

## Decision (user directive)

**Keep the DOM rendering architecture** (DR-012 HTML-canonical surface stays).
Improve performance *within* the existing `transform`-based camera model — no
Canvas2D migration, no `worldToScreen` rewrite of the coordinate system. See
[DR-021](../decisions/DR-021-dom-render-perf-culling-and-image-cap.md).

## Scope

| Phase | What | Where | Risk |
|---|---|---|---|
| **1** | IntersectionObserver viewport culling — off-screen frames → `visibility:hidden` (drops paint/raster). `decoding="async"` + `loading="lazy"` on images. | `FrameStage.tsx`, new `viewport-cull-context.ts`, `ImageBlock.tsx` | Low — additive, infinite-canvas-gated, null-safe in present/test paths. |
| **2** | Image backing-raster cap (inverse-scale so `<img>` rasters at ~screen px on deep zoom-in). | `ImageBlock.tsx` (+ totalScale hot path) | Med — objectFit/crop/filter interactions; own spike + e2e. **Deferred.** |
| **3 (opt)** | Defensive: re-audit `will-change` lifecycle; consider `content-visibility` on bleed-safe subtrees. | — | Deferred. |

Engineering Plan + SOLID/GRASP + the RPR-001 review: `features/canvas-render-perf/ENGINEERING_PLAN.md`.

## Phase 1 — checklist

- [x] `ViewportCullContext` registry (one IO, root = `outerRef`, `rootMargin:100%`, ref-mutation toggle — no re-render).
- [x] `NestedFrame` registers its wrapper; culled → `visibility:hidden`.
- [x] `ImageBlock` `<img>` gets `loading="lazy"` + `decoding="async"`.
- [x] Verify: typecheck **clean**, declarativecheck + puritycheck **OK**, biome **0 err** (9 pre-existing advisory warns per DR-020), e2e `canvas-cull.spec.ts` **PASS** (off-viewport frame → `visibility:hidden`, restored on pan-back). Regression sweep of infinite-canvas specs (fit-camera, background, figma-drag-to-add, rotation-pivot-reparent, reparent-thumbnail-drop) green. **`figma-parent-first-select.spec.ts:107` fails on baseline too (pre-existing, coordinate-fragile test) — not caused by this change.**

## Measurement (2026-05-30) — see [RPR-001 addendum](../rendering-reviews/RPR-001-addendum-phase1-measurement.md)

Harness `apps/web/e2e/canvas-cull-perf.spec.ts` (`WEAVE_PERF=1`, gate-excluded) +
DEV `__weaveDisableCull` toggle. 80-image grid over ~7×6 viewports, cull OFF vs ON:

- Painted/composited frames **80 → 16 (−80%)**, JS heap **81 → 51 MB (−37%)**.
- **Decoded bitmaps NOT freed**: 82/82 stay decoded (~80 MB); **64 sit in culled frames**. `visibility:hidden` keeps the render tree → decode retained.
- GPU texture bytes (the literal "too large" symptom) not measurable headless → manual `chrome://gpu` lab step recorded in the addendum.

**Phase 2 re-prioritized by data**: top lever is now **free decoded-bitmap memory for culled frames** (2a), NOT the inverse-scale raster cap (demoted to 2c, gated on the manual GPU read).

## Phase 2a — done (decode-memory freeing)

- `FrameCulledContext` + `useIsCulled()` in `viewport-cull-context.ts`. NestedFrame
  publishes per-frame cull state (React state, flips only on a viewport-cross
  transition — NOT the 60Hz hot path; `visibility` stays a ref-mutation).
- `ImageBlock` reads `useIsCulled()` → drops its `<img>` while culled (releases the
  decoded bitmap), restores on return (re-decode finishes inside the 1-viewport buffer).
- **Measured (same 80-image harness): decoded-bitmap memory 80 MB → 16 MB (−80%)**,
  DOM imgs 82 → 18, `decodedInCulled` 64 → 0.
- e2e: `canvas-cull.spec.ts` 2nd test (culled image frame → 0 `<img>`, restored on
  pan-back) **PASS**. Regression sweep (fit-camera, figma-drag-to-add, background,
  shape-media-fill) **10/10 green**.

## Phase 2b — done (`rootMargin` tuned to 50%)

Swept `rootMargin` ∈ {150,100,50,25,0}% on the 80-image harness (`__weaveCullMargin`
DEV override). Chose **`CULL_ROOT_MARGIN = "50%"`** (SSOT in `viewport-cull-context.ts`):
at the same geometry, visible set **16 → 6** and decode memory **16 → 6 MB** vs the
old 100%, while keeping a ~half-viewport pre-render ring (covers normal drag-pan,
no pop-in). 25%/0% drop the buffer to 0 (pop-in) for only ~2 MB more. Full curve in
the [RPR-001 addendum](../rendering-reviews/RPR-001-addendum-phase1-measurement.md).
Gate spec re-passes with the 50% default (cull tests pan well past any margin).

## Status

Phase 1 + 2a + 2b **done & verified**: at fit on a 7×6-viewport / 80-image board the
working set is ~6 frames / ~6 MB decoded (from 80 / 80 MB) — painted set & decode
memory both **~−90%** at the chosen 50% margin.

**2c gate — measurement tooling delivered, awaiting a real-Chrome run (not me):**
headless can't read GPU texture bytes, so a headed probe `apps/web/e2e/gpu-zoom-probe.spec.ts`
(`WEAVE_GPU=1 … --headed`) + step-by-step
[GPU measurement guide](../rendering-reviews/RPR-001-gpu-measurement-guide.md) are
provided. Owner runs it, fills the matrix, and the decision rule in the guide says
build 2c only if a single image layer approaches max-texture-size / GPU memory spikes;
otherwise close 2c as "not warranted".

Remaining deferred: 2c (pending the GPU read above), B (downscaled source tiers →
agocraft HANDOFF). `pnpm build` + full `pnpm e2e` not run this session — run before
release per LG gate (note the unrelated `qr/` tsc break must be fixed first or it
fails the shared gate).

**Unrelated:** `apps/web/src/document/qr/` (untracked, a separate in-progress QR
feature) has typecheck errors (`QrCode.Ecc`) — not part of WI-058, breaks the shared
`tsc` gate; owner to fix separately.

## Notes

- `content-visibility:auto` was **rejected** for culling: it implies
  `contain: paint`, which clips a frame's intentional overflow bleed (slide
  bullets / canvas shapes past the frame). `visibility` adds no containment.
- If Phase 2 ever needs a thumbnail/mip tier, that touches the agocraft media
  domain and must go through a HANDOFF into
  `workspace/agocraft/records/decision-handoffs/`, not a direct edit.
