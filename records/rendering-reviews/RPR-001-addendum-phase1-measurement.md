# RPR-001 Addendum — Phase 1 culling measurement (WI-058)

Date: 2026-05-30 · Owner: hbpark · Parent: [RPR-001](./RPR-001-infinite-canvas-zoom-render.md) · WI: [WI-058](../work-items/WI-058-infinite-canvas-render-performance.md)

## Method

Harness `apps/web/e2e/canvas-cull-perf.spec.ts` (gated `WEAVE_PERF=1`, excluded
from the e2e gate). Seeds an **80-image grid** (10×8, each a runtime-generated
512² data-URI → ~1 MB decoded each) spread over design ratio x∈[-3,4],
y∈[-2.5,3.5] (≈ 7×6 viewports) on the infinite canvas. Captures DOM + CDP
`Performance.getMetrics` at the whole-plane fit, **culling OFF vs ON** at
identical geometry (the DEV `__weaveDisableCull` escape hatch in `FrameStage`).
Headless Chromium, `--workers=1`, reduced motion.

## Results

| Metric | cull OFF | cull ON | Δ |
|---|---:|---:|---|
| Frames culled (`visibility:hidden`) | 0 / 80 | **64 / 80** | painted set −80% |
| Frames visible (painted/composited) | 80 | **16** | — |
| JS heap (CDP `JSHeapUsedSize`) | 81 MB | **51 MB** | **−37%** |
| Decoded `<img>` | 82 / 82 | 82 / 82 | **0** |
| Decoded bitmaps inside culled frames | 0 | **64** | not freed |
| Approx decoded-bitmap bytes | 80 MB | 80 MB | **0** |
| DOM nodes | 1952 | 1952 | 0 (cull hides, doesn't unmount) |
| Pan wall-clock (30 wheel steps) | 1188 ms | 1141 ms | ~noise (headless) |

(First pass used a [-0.5,2.5]² spread and culled only 8/80 — the `rootMargin:
"100%"` buffer keeps a ~3×3-viewport region alive, so content must sit > 1
viewport outside the view to cull. Widening the spread to 7×6 viewports gave the
64/80 above.)

## Findings

1. **Culling works and scales.** On a large board the painted/composited frame
   set drops 80 → 16 (−80%) and JS heap drops 37%. The mechanism is sound.
2. **Decoded image bitmaps are NOT freed.** `visibility:hidden` keeps the
   element in the render tree, so all 82 images stay decoded (~80 MB); 64 of
   those bitmaps sit inside culled, off-screen frames. **This is the dominant
   image-memory pool and Phase 1 leaves it on the table.**
3. **GPU texture bytes — not measurable headless.** The user's literal symptom
   ("이미지를 너무 크게 그리려고") is GPU *raster* memory on zoom-in, which CDP does
   not expose. Requires a manual lab read (below).
4. **`rootMargin: "100%"` is conservative** (keeps 3×3 viewports). A smaller
   margin culls sooner / smaller working set, at higher pop-in risk on fast pan.
   Tunable, not yet tuned.

## Recommendation (revises Phase 2 priority)

The measurement **redirects the next step away from the inverse-scale raster cap**
(narrow: only a single zoomed-in image's GPU texture, which Chromium already
clamps and we can't measure here) **toward freeing decoded-bitmap memory for
culled frames** — the larger, automatable lever for image-heavy boards:

- **2a (new top priority):** when a frame is culled, drop its heavy decode —
  e.g. `display:none` on the image content (releases the decoded bitmap) or
  swap `src` to a tiny placeholder; restore on un-cull. Needs the cull signal to
  reach `ImageBlock` (a `useIsCulled()`-style hook off the same registry).
- **2b:** tune `rootMargin` (try `"50%"`) and re-measure culled-count vs pop-in.
- **2c (was Phase 2):** inverse-scale raster cap — only if the manual GPU read
  below shows single-image zoom-in is still a real ceiling.
- **B (longer-term):** downscaled source tiers (agocraft media domain → HANDOFF)
  — best for the zoomed-out many-images case.

## Phase 2a result (decode-memory freeing — implemented)

After wiring `FrameCulledContext` + `useIsCulled()` so `ImageBlock` drops its
`<img>` while its frame is culled (same harness, cull ON):

| Metric | Phase 1 only | Phase 1 + 2a | Δ |
|---|---:|---:|---|
| Decoded `<img>` | 82 | **18** | −78% |
| Approx decoded-bitmap bytes | 80 MB | **16 MB** | **−80%** |
| Decoded bitmaps in culled frames | 64 | **0** | freed |
| DOM `<img>` nodes | 82 | 18 | −64 |

Net: painted/composited set −80% (Phase 1) **and** decoded-image memory −80%
(Phase 2a). Re-decode on un-cull happens inside the one-viewport buffer, so no
visible flash. (`JSHeapUsedSize` is unchanged — decoded bitmaps live in the
renderer image cache, not the V8 heap; `approxDecodedMB` is the right pool.)

## Phase 2b — `rootMargin` sweep (decided: 50%)

Same 80-image grid (7×6 viewports, ~4 frames truly in-view at fit), sweeping the
cull `rootMargin` via DEV `__weaveCullMargin`:

| rootMargin | culled | visible | buffer ring | decoded `<img>` | decoded MB |
|---|---:|---:|---:|---:|---:|
| OFF | 0 | 80 | 76 | 82 | 80 |
| 150% | 44 | 36 | 32 | 38 | 36 |
| 100% | 64 | 16 | 12 | 18 | 16 |
| **50% (chosen)** | 74 | **6** | 2 | 8 | **6** |
| 25% | 76 | 4 | 0 | 6 | 4 |
| 0% | 76 | 4 | 0 | 6 | 4 |

"buffer ring" = rendered-but-off-viewport frames (the pre-render cost of the
margin). Decision = **`CULL_ROOT_MARGIN = "50%"`** (`viewport-cull-context.ts`):

- vs 100%: decode memory **16 → 6 MB** and visible set **16 → 6** at the same
  geometry, while keeping a ~half-viewport pre-render ring (buffer 2). A normal
  drag-pan moves < 0.5 viewport before the IO callback (1–2 frame lag) re-renders
  the next frame → no pop-in.
- vs 25%/0%: those save only ~2 MB more but drop the buffer ring to **0** — any
  pan reveals an un-rendered/un-decoded frame for a frame or two (pop-in + decode
  flash). Not worth it.
- 100%/150% only buy extra fast-*fling* smoothness at 2.7–6× the memory; revisit
  only if fling pop-in is reported.

## Manual lab step (GPU texture — required before 2c)

Headless can't read GPU memory. On a real Chrome:
1. Open a large image board, zoom in hard on one large image.
2. `chrome://gpu` → "GPU Memory" / DevTools ▸ Rendering ▸ "Layer borders" +
   ▸ Layers panel (per-layer memory vs `max-texture-size`).
3. Or `chrome://tracing` with `gpu` + `disabled-by-default-gpu.service`
   categories; inspect texture allocation during zoom.
Compare cull ON/OFF and zoomed-out/in. Record bytes here before building 2c.
