// WI-058 2c GATE — GPU texture measurement PROBE (manual, headed).
//
// Headless Chromium can't report GPU texture bytes (software GL), so this
// probe is meant to be run on a REAL GPU-backed Chrome with a human reading
// chrome://gpu + the DevTools Layers panel. See the step-by-step in
//   records/rendering-reviews/RPR-001-gpu-measurement-guide.md
//
// Run:
//   WEAVE_GPU=1 npx playwright test gpu-zoom-probe.spec.ts --headed --workers=1
//
// It seeds ONE high-resolution image on the infinite canvas, zooms in hard so
// the layer's raster demand balloons, prints the predicted texture size, and
// then `page.pause()`s so you can inspect chrome://gpu / Layers in the same
// browser. `window.__gpuProbe` exposes `zoomIn/zoomOut/info/toggleCull` for
// interactive poking from the DevTools console.

import { test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

const gpuTest = process.env.WEAVE_GPU === "1" ? test : test.skip;

const IMG_PX = 3000; // ~36 MB decoded — a deliberately heavy single image.

gpuTest("probe: single-image zoom-in GPU texture", async ({ page }) => {
  test.setTimeout(30 * 60 * 1000); // long — you'll be inspecting manually.
  // For the cull-OFF arm of the A/B, run with WEAVE_NOCULL=1 — set before
  // mount so the registry stays null (reload won't help; window globals reset).
  if (process.env.WEAVE_NOCULL === "1") {
    await page.addInitScript(() => {
      (globalThis as { __weaveDisableCull?: boolean }).__weaveDisableCull = true;
    });
  }
  await clearAllDesigns(page);
  await prepareDesign(page, { flavor: "mixed", title: "gpu-probe" });

  // Seed one big image centred on the design plane.
  const src = await page.evaluate((px) => {
    const cv = document.createElement("canvas");
    cv.width = px;
    cv.height = px;
    const g = cv.getContext("2d")!;
    // Fine checker so upscaling is visually obvious + raster is non-trivial.
    for (let y = 0; y < px; y += 40) {
      for (let x = 0; x < px; x += 40) {
        g.fillStyle = ((x + y) / 40) % 2 === 0 ? "#3b82f6" : "#f8fafc";
        g.fillRect(x, y, 40, 40);
      }
    }
    return cv.toDataURL("image/png");
  }, IMG_PX);
  await page.evaluate(
    ({ src }) => {
      type Editor = { exec: (n: string, i: unknown) => unknown };
      type Doc = { root: { id: string | number } };
      const w = window as unknown as { __weaveEditor?: Editor; __weaveDoc?: Doc };
      w.__weaveEditor!.exec("weave.item.add", {
        kind: "image",
        containerId: String(w.__weaveDoc!.root.id),
        frame: { x: 0.35, y: 0.35, width: 0.3, height: 0.3, rotation: 0 },
        attrsOverride: { src, fit: "fill" },
      });
    },
    { src },
  );
  await page.waitForTimeout(800);

  // Install an interactive probe on `window`. Zoom is driven by synthetic
  // ctrl+wheel on the canvas (same path the real pinch/zoom uses).
  await page.evaluate(
    ({ imgPx }) => {
      const canvas = document.querySelector('[data-canvas="document"]') as HTMLElement | null;
      const rect = canvas?.getBoundingClientRect();
      const cx = (rect?.left ?? 0) + (rect?.width ?? 0) / 2;
      const cy = (rect?.top ?? 0) + (rect?.height ?? 0) / 2;
      const wheel = (deltaY: number) =>
        canvas?.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY,
            ctrlKey: true,
            clientX: cx,
            clientY: cy,
            bubbles: true,
            cancelable: true,
          }),
        );
      function info() {
        const img = document.querySelector("img") as HTMLImageElement | null;
        const r = img?.getBoundingClientRect();
        const dpr = window.devicePixelRatio;
        const onW = Math.round(r?.width ?? 0);
        const onH = Math.round(r?.height ?? 0);
        // Texture demand if the browser rasters the layer at on-screen px ×
        // DPR (it clamps to natural size / max-texture-size in practice).
        const demandPx = onW * dpr * (onH * dpr);
        const naturalPx = imgPx * imgPx;
        const out = {
          naturalPx: `${imgPx}×${imgPx}`,
          onScreenCss: `${onW}×${onH}`,
          dpr,
          rasterEdgePx: `${Math.round(onW * dpr)}×${Math.round(onH * dpr)}`,
          predictedTextureMB: Math.round((Math.min(demandPx, naturalPx) * 4) / 1048576),
          uncappedDemandMB: Math.round((demandPx * 4) / 1048576),
          imgElements: document.querySelectorAll("img").length,
        };
        // eslint-disable-next-line no-console
        console.log("GPUPROBE::", JSON.stringify(out));
        return out;
      }
      (window as unknown as { __gpuProbe?: unknown }).__gpuProbe = {
        zoomIn: (notches = 10) => {
          for (let i = 0; i < notches; i++) wheel(-100);
          return info();
        },
        zoomOut: (notches = 10) => {
          for (let i = 0; i < notches; i++) wheel(100);
          return info();
        },
        info,
      };
      info();
    },
    { imgPx: IMG_PX },
  );

  // Pre-zoom to a strong level so the heavy state is the default to inspect.
  await page.evaluate(() => {
    (window as unknown as { __gpuProbe: { zoomIn: (n: number) => unknown } }).__gpuProbe.zoomIn(28);
  });
  await page.waitForTimeout(500);

  console.log(
    "\nGPUPROBE ready. In THIS browser:\n" +
      "  • New tab → chrome://gpu  (read 'GPU Memory' / 'GPU Process')\n" +
      "  • F12 → ⋮ More tools → Layers (per-layer 'Memory estimate' vs max-texture-size)\n" +
      "  • Console: __gpuProbe.zoomIn(20) / .zoomOut(20) / .info()\n" +
      "  • Compare zoom-out vs zoom-in here; for cull ON vs OFF re-run the\n" +
      "    whole probe with WEAVE_NOCULL=1 (a clean baseline, not a live toggle).\n" +
      "Record numbers in RPR-001-gpu-measurement-guide.md, then resume to end.\n",
  );

  // Pauses (opens the Playwright Inspector); resume/close when done measuring.
  await page.pause();
});
