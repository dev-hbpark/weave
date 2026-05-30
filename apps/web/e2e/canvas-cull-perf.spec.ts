// WI-058 perf MEASUREMENT harness (not a gate spec — run manually:
//   npx playwright test canvas-cull.perf.ts --reporter=line
// ).
//
// Seeds a large grid of real (decoded) image frames spread across the
// infinite canvas, then captures working-set metrics via CDP at an identical
// geometry for culling ON vs OFF (the DEV `__weaveDisableCull` escape hatch).
// Each run prints a `PERF::{json}` line that the operator collects.
//
// Reproducibility caveats (recorded in RPR-001 addendum):
//   - Headless Chromium; numbers are INDICATIVE deltas, not absolute device
//     memory. GPU-texture bytes need manual chrome://gpu / about:tracing.
//   - JS heap / DOM nodes are expected to be ~equal: culling HIDES nodes, it
//     does not unmount them. The win shows in decoded-image count + paint.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// Measurement-only — excluded from the normal `pnpm e2e` gate. Run with:
//   WEAVE_PERF=1 npx playwright test canvas-cull-perf.spec.ts --reporter=line
const perfTest = process.env.WEAVE_PERF === "1" ? test : test.skip;

const COLS = 10;
const ROWS = 8; // 80 image frames
const IMG_PX = 512; // decoded bitmap ≈ 512×512×4 = 1 MB each

/** Seed COLS×ROWS image frames spread over design ratio x∈[-0.5,2.5],
 *  y∈[-0.5,2.0] so a large fraction sits outside the initial whole-plane
 *  fit. Each carries a runtime-generated 512² data-URI so decode is real. */
async function seedImageGrid(page: Page): Promise<number> {
  return page.evaluate(
    ({ cols, rows, imgPx }) => {
      const cv = document.createElement("canvas");
      cv.width = imgPx;
      cv.height = imgPx;
      const g = cv.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, imgPx, imgPx);
      grad.addColorStop(0, "#3b82f6");
      grad.addColorStop(1, "#ec4899");
      g.fillStyle = grad;
      g.fillRect(0, 0, imgPx, imgPx);
      const src = cv.toDataURL("image/png");

      type Editor = { exec: (name: string, input: unknown) => unknown };
      type Doc = { root: { id: string | number } };
      const w = window as unknown as { __weaveEditor?: Editor; __weaveDoc?: Doc };
      const editor = w.__weaveEditor!;
      const rootId = String(w.__weaveDoc!.root.id);
      let n = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // Spread well beyond the rootMargin buffer (cull keeps a ~3×3
          // viewport region alive): x∈[-3,4], y∈[-2.5,3.5] ≈ 7×6 viewports.
          const x = -3 + (c / (cols - 1)) * 7.0;
          const y = -2.5 + (r / (rows - 1)) * 6.0;
          editor.exec("weave.item.add", {
            kind: "image",
            containerId: rootId,
            frame: { x, y, width: 0.12, height: 0.12, rotation: 0 },
            attrsOverride: { src, fit: "cover" },
          });
          n++;
        }
      }
      return n;
    },
    { cols: COLS, rows: ROWS, imgPx: IMG_PX },
  );
}

interface Snapshot {
  config: string;
  totalFrames: number;
  culledFrames: number;
  visibleFrames: number;
  bufferRing: number;
  totalImgs: number;
  decodedImgs: number;
  decodedInCulled: number;
  approxDecodedMB: number;
  domNodes: number;
  jsHeapMB: number;
  layoutCount: number;
  recalcStyleCount: number;
  panMs: number;
}

async function snapshot(page: Page, config: string): Promise<Snapshot> {
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");

  // Let layout + lazy-load + IntersectionObserver settle at the fit geometry.
  await page.waitForTimeout(1500);

  const dom = await page.evaluate(() => {
    const frames = Array.from(document.querySelectorAll("[data-frame-id]"));
    const culledFrameEls = frames.filter((el) => getComputedStyle(el).visibility === "hidden");
    const imgs = Array.from(document.querySelectorAll("img")) as HTMLImageElement[];
    const decoded = imgs.filter((im) => im.naturalWidth > 0);
    const decodedPx = decoded.reduce((acc, i) => acc + i.naturalWidth * i.naturalHeight, 0);
    // Decoded bitmaps that sit inside a CULLED (visibility:hidden) frame —
    // these are NOT freed by Phase-1 culling (visibility keeps the render
    // tree), so they quantify the decode-memory the current approach leaves
    // on the table.
    const decodedInCulled = decoded.filter((im) =>
      culledFrameEls.some((f) => f.contains(im)),
    ).length;
    // Pre-render buffer cost: frames that are rendered (not culled) but whose
    // box does NOT intersect the true viewport — i.e. kept alive purely by the
    // rootMargin buffer. Larger margin → larger ring → more memory.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visibleEls = frames.filter((el) => getComputedStyle(el).visibility !== "hidden");
    const bufferRing = visibleEls.filter((el) => {
      const r = el.getBoundingClientRect();
      const inView = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
      return !inView;
    }).length;
    return {
      totalFrames: frames.length,
      culledFrames: culledFrameEls.length,
      visibleFrames: visibleEls.length,
      bufferRing,
      totalImgs: imgs.length,
      decodedImgs: decoded.length,
      decodedInCulled,
      approxDecodedMB: Math.round((decodedPx * 4) / (1024 * 1024)),
    };
  });

  // Pan timing — rough INP proxy: 30 wheel pans across the grid.
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await page.mouse.move(Math.floor(vp.w * 0.5), Math.floor(vp.h * 0.45));
  const t0 = await page.evaluate(() => performance.now());
  for (let i = 0; i < 30; i++) await page.mouse.wheel(120, 80);
  // Force a settled read so the timing includes the resulting work.
  await page.evaluate(() => document.body.getBoundingClientRect().width);
  const panMs = Math.round((await page.evaluate(() => performance.now())) - t0);
  // Pan back to the seeded centre so the metric read reflects the fit state.
  for (let i = 0; i < 30; i++) await page.mouse.wheel(-120, -80);
  await page.waitForTimeout(400);

  const { metrics } = await client.send("Performance.getMetrics");
  const m = (name: string) => metrics.find((x) => x.name === name)?.value ?? 0;

  return {
    config,
    ...dom,
    domNodes: m("Nodes"),
    jsHeapMB: Math.round(m("JSHeapUsedSize") / (1024 * 1024)),
    layoutCount: m("LayoutCount"),
    recalcStyleCount: m("RecalcStyleCount"),
    panMs,
  };
}

async function run(page: Page, config: string): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await clearAllDesigns(page);
  await prepareDesign(page, { flavor: "mixed", title: `perf-${config}` });
  const n = await seedImageGrid(page);
  expect(n).toBe(COLS * ROWS);
  await page.waitForTimeout(500);
  const snap = await snapshot(page, config);
  // biome-ignore lint/suspicious/noConsole: measurement output is the point.
  console.log(`PERF::${JSON.stringify(snap)}`);
}

perfTest("measure: cull OFF (baseline)", async ({ page }) => {
  await page.addInitScript(() => {
    (globalThis as { __weaveDisableCull?: boolean }).__weaveDisableCull = true;
  });
  await run(page, "cull-OFF");
});

// 2b margin sweep — each run overrides `__weaveCullMargin` before mount and
// reports working set + pre-render buffer ring + decoded MB at that margin.
for (const margin of ["150%", "100%", "50%", "25%", "0%"]) {
  perfTest(`measure: cull ON rootMargin=${margin}`, async ({ page }) => {
    await page.addInitScript((m) => {
      (globalThis as { __weaveCullMargin?: string }).__weaveCullMargin = m;
    }, margin);
    await run(page, `m=${margin}`);
  });
}
