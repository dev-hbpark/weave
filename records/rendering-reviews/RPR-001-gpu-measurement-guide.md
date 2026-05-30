# RPR-001 — GPU texture measurement guide (WI-058 Phase 2c gate)

Date: 2026-05-30 · Owner: hbpark · Parent: [RPR-001 addendum](./RPR-001-addendum-phase1-measurement.md)

## Why this is manual

Phase 2c (inverse-scale image raster cap) is **gated** on evidence that a single
zoomed-in image's GPU layer texture is actually a ceiling. Headless Chromium
can't show this: it runs software GL and CDP does not expose GPU texture bytes.
So this measurement must run on a **real, GPU-backed Chrome with a human reading
`chrome://gpu` + the DevTools Layers panel.** Build 2c only if the numbers below
say it's needed.

## Prereqs

- A normal Chrome/Chromium with hardware acceleration ON
  (`chrome://settings` → System → "Use graphics acceleration when available";
  confirm at `chrome://gpu` that "Canvas / Compositing / Rasterization" are
  *Hardware accelerated*, not *Software only*).
- The weave dev server reachable (the probe's `webServer` config starts
  `pnpm dev` automatically, or have it running on :5179).

## Run the probe (headed)

From `apps/web/`:

```bash
# Cull ON (production default, rootMargin 50%):
WEAVE_GPU=1 npx playwright test gpu-zoom-probe.spec.ts --headed --workers=1

# Cull OFF baseline (re-run separately):
WEAVE_GPU=1 WEAVE_NOCULL=1 npx playwright test gpu-zoom-probe.spec.ts --headed --workers=1
```

The probe seeds ONE 3000×3000 image (~36 MB decoded), pre-zooms ~28 notches so
the layer raster demand is large, prints a `GPUPROBE:: {...}` line, then
`page.pause()`s (Playwright Inspector) leaving the browser open for inspection.

`window.__gpuProbe` in the page console:
- `__gpuProbe.zoomIn(20)` / `.zoomOut(20)` — change zoom (synthetic ctrl+wheel).
- `__gpuProbe.info()` — re-print on-screen size, DPR, raster edge px, predicted
  texture MB (capped at natural), uncapped demand MB, `<img>` count.

## What to read

### A. `chrome://gpu` (open in a NEW TAB of the SAME browser)
- Scroll to **"GPU Memory Buffer"** / the process memory section. Note the
  GPU process memory at: zoomed-out, zoomed-in, cull ON, cull OFF.
- Top "Graphics Feature Status": confirm hardware accel (else numbers are moot).

### B. DevTools **Layers** panel (on the weave tab)
- F12 → ⋮ (More tools) → **Layers**. Select the design-plane / image layer.
- Read **"Memory estimate"** per layer and the layer's pixel **size**. Compare
  the largest layer's edge to the GPU **max texture size** (shown in
  `chrome://gpu` under "Driver Information" / Limits; commonly 8192 or 16384).
- The failure signal: at high zoom a single image layer's edge approaches or
  exceeds max-texture-size (→ tiling/fallback) and/or per-layer memory balloons.

### C. (optional, power users) `chrome://tracing`
- Record with categories `gpu`, `disabled-by-default-gpu.service`,
  `disabled-by-default-devtools.timeline`. Zoom in during capture; inspect
  `GpuMemory` / texture allocation events.

## Record the matrix

| Scenario | GPU mem (chrome://gpu) | Largest layer edge px | Layer mem est | Notes |
|---|---|---|---|---|
| zoom-out, cull ON | | | | |
| zoom-in, cull ON | | | | |
| zoom-in, cull OFF | | | | |
| many images (use `canvas-cull-perf`), zoom-in | | | | |

(Also paste the probe's `GPUPROBE:: {...}` `predictedTextureMB` / `rasterEdgePx`
at the zoom you measured, so the predicted vs actual can be compared.)

## Decision rule → build 2c or not

**Build Phase 2c (inverse-scale raster cap)** only if, at a realistic max zoom:
- a single image layer's edge **approaches/exceeds max-texture-size** (visible as
  tiling, a blurry fallback, or a hard cap), **or**
- zoom-in GPU memory rises **materially** above the cull-ON baseline (rule of
  thumb: > ~1.5× and into the hundreds of MB) in a way the user can feel
  (jank/crash on mid-tier hardware).

**Otherwise skip 2c.** If Chromium's internal raster-scale clamp already keeps
single-image textures bounded (the common case), 2c adds fragile code
(objectFit/crop/filter × inverse-scale) for no measurable win — Phases 1+2a+2b
already cut the painted set and decode memory ~90%. In that case, close 2c in
WI-058 as "not warranted by measurement" and keep the probe for future regressions.

If the zoomed-OUT many-images case is the pain instead, that points to **Option B**
(downscaled source tiers, agocraft media HANDOFF), not 2c.
