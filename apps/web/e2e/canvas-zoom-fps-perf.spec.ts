// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results inside page.evaluate()
// WI-197 perf MEASUREMENT harness (not a gate spec — run manually:
//   WEAVE_PERF=1 npx playwright test canvas-zoom-fps-perf.spec.ts --reporter=line
// ).
//
// Measures GESTURE FRAME TIMING (the 60fps budget) while zooming / panning a
// mixed-flavor canvas seeded with a large grid of shape items. Companion to
// canvas-cull-perf.spec.ts (which measures the paint/decode working set);
// this spec targets the JS-stage cost — before WI-197 every camera change
// mirrored into React state and re-rendered the whole NestedFrame tree, so
// frame time grew with item count even with culling active.
//
// Each run prints a `PERF::{json}` line: rAF frame-delta stats during a
// 90-frame wheel-zoom burst and a 90-frame wheel-pan burst, plus CDP
// Performance metric deltas (ScriptDuration / LayoutCount / RecalcStyleCount)
// across each burst. Run before/after a change at the same CPU throttle to
// compare. Headless caveat: absolute numbers are indicative, deltas are the
// signal (same caveat as canvas-cull-perf).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// Measurement-only — excluded from the normal `pnpm e2e` gate.
const perfTest = process.env.WEAVE_PERF === "1" ? test : test.skip;

const COLS = 14;
const ROWS = 12; // 168 shape items
/** CDP CPU throttle — mid-tier device proxy (RPR-001 measurement plan). */
const CPU_THROTTLE = 4;

/** Seed COLS×ROWS shape items spread over a wide ratio range so a fraction
 *  sits outside the viewport (exercises culling + off-screen React cost). */
async function seedShapeGrid(page: Page): Promise<number> {
  return page.evaluate(
    ({ cols, rows }) => {
      type Editor = { exec: (name: string, input: unknown) => unknown };
      type Doc = { root: { id: string | number } };
      const w = window as unknown as { __weaveEditor?: Editor; __weaveDoc?: Doc };
      const editor = w.__weaveEditor!;
      const rootId = String(w.__weaveDoc!.root.id);
      let n = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = -1.5 + (c / (cols - 1)) * 4.0;
          const y = -1.0 + (r / (rows - 1)) * 3.0;
          editor.exec("weave.item.add", {
            kind: "shape",
            containerId: rootId,
            frame: { x, y, width: 0.06, height: 0.06, rotation: 0 },
          });
          n++;
        }
      }
      return n;
    },
    { cols: COLS, rows: ROWS },
  );
}

interface BurstStats {
  frames: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  /** % of frames over the 60fps budget (17ms). */
  droppedPct: number;
  scriptMs: number;
  layoutCount: number;
  recalcStyleCount: number;
}

type MetricsSnap = { metrics: Array<{ name: string; value: number }> };

/** Reduce raw rAF deltas + CDP metric snapshots to the PERF:: stats shape.
 *  Shared by the wheel bursts and the WI-198 drag burst. */
function statsFrom(deltas: number[], before: MetricsSnap, after: MetricsSnap): BurstStats {
  const m = (snap: MetricsSnap, name: string) =>
    snap.metrics.find((x) => x.name === name)?.value ?? 0;
  // First two samples cover sampler start-up, not gesture work.
  const body = deltas.slice(2);
  const sorted = [...body].sort((a, b) => a - b);
  const mean = body.reduce((acc, d) => acc + d, 0) / body.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  return {
    frames: body.length,
    meanMs: Math.round(mean * 100) / 100,
    p95Ms: Math.round(p95 * 100) / 100,
    maxMs: Math.round(Math.max(...body) * 100) / 100,
    droppedPct: Math.round((body.filter((d) => d > 17).length / body.length) * 1000) / 10,
    scriptMs: Math.round((m(after, "ScriptDuration") - m(before, "ScriptDuration")) * 1000),
    layoutCount: m(after, "LayoutCount") - m(before, "LayoutCount"),
    recalcStyleCount: m(after, "RecalcStyleCount") - m(before, "RecalcStyleCount"),
  };
}

/** Drive one synthetic wheel event per rAF for `frames` frames against the
 *  frame-stage element, sampling the rAF delta of every frame. `zoom` sends
 *  ctrl+wheel (pinch zoom, alternating in/out so the geometry round-trips);
 *  plain wheel pans (alternating direction). Runs entirely in-page so event
 *  dispatch and frame sampling share the same clock. */
async function measureBurst(page: Page, mode: "zoom" | "pan"): Promise<BurstStats> {
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");
  const before = await client.send("Performance.getMetrics");

  const deltas = await page.evaluate(
    ({ kind }) =>
      new Promise<number[]>((resolve) => {
        const el = document.querySelector('[data-testid="frame-stage"]')!;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const TOTAL = 90;
        const samples: number[] = [];
        let last = performance.now();
        let i = 0;
        const tick = () => {
          const now = performance.now();
          samples.push(now - last);
          last = now;
          if (i >= TOTAL) {
            resolve(samples);
            return;
          }
          // Alternate direction every 15 frames so the camera ends near its
          // start and zoom never pins against the [0.1, 8] clamp.
          const dir = Math.floor(i / 15) % 2 === 0 ? -1 : 1;
          const init: WheelEventInit =
            kind === "zoom"
              ? { ctrlKey: true, deltaY: dir * 100, clientX: cx, clientY: cy }
              : { deltaX: dir * 60, deltaY: dir * 40, clientX: cx, clientY: cy };
          el.dispatchEvent(new WheelEvent("wheel", { ...init, bubbles: true, cancelable: true }));
          i++;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { kind: mode },
  );

  const after = await client.send("Performance.getMetrics");
  return statsFrom(deltas, before, after);
}

/** WI-198 — drag burst. Unlike the wheel bursts (synthetic in-page events),
 *  FrameMoveBinding needs TRUSTED pointer events, so the gesture is driven
 *  from Node via `page.mouse` (the frame-move-snap.spec.ts pattern) while an
 *  in-page rAF sampler — started before `mouse.down`, stopped by a window
 *  flag after `mouse.up` — collects frame deltas concurrently. Every
 *  pointermove commits `weave.item.update` through the editor, so this
 *  measures the per-tick document-commit → React reconciliation cost that
 *  `React.memo(NestedFrame)` bounds to the dragged item's ancestor path. */
async function measureDragBurst(page: Page): Promise<BurstStats> {
  const client = await page.context().newCDPSession(page);
  await client.send("Performance.enable");

  // Pick the seeded shape closest to the viewport center (visible, on-screen
  // body — `kind:"shape"` bodies are directly draggable).
  const target = await page.evaluate(() => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let best: { x: number; y: number; d: number } | null = null;
    for (const el of Array.from(document.querySelectorAll('[data-frame-kind="shape"]'))) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (best === null || d < best.d) best = { x, y, d };
    }
    return best!;
  });

  const before = await client.send("Performance.getMetrics");

  // Start the sampler; it runs until the Node side raises the done flag.
  const samplerPromise = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const w = window as unknown as { __weaveDragPerfDone?: boolean };
        w.__weaveDragPerfDone = false;
        const samples: number[] = [];
        let last = performance.now();
        const tick = () => {
          const now = performance.now();
          samples.push(now - last);
          last = now;
          if (w.__weaveDragPerfDone === true) {
            resolve(samples);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );

  const MOVES = 90;
  let px = target.x;
  let py = target.y;
  await page.mouse.move(px, py);
  await page.mouse.down();
  for (let i = 0; i < MOVES; i++) {
    // Alternate direction every 15 moves so the item round-trips near its
    // start (same shape as the wheel bursts' direction flip).
    const dir = Math.floor(i / 15) % 2 === 0 ? 1 : -1;
    px += dir * 4;
    py += dir * 3;
    await page.mouse.move(px, py);
  }
  await page.mouse.up();
  await page.evaluate(() => {
    (window as unknown as { __weaveDragPerfDone?: boolean }).__weaveDragPerfDone = true;
  });
  const deltas = await samplerPromise;

  const after = await client.send("Performance.getMetrics");
  return statsFrom(deltas, before, after);
}

perfTest("measure: zoom/pan gesture frame timing on a dense mixed canvas", async ({ page }) => {
  // Seeding 168 items (one exec → one full reconciliation each) plus two
  // CPU-throttled 90-frame bursts comfortably exceeds the 30s suite default.
  test.setTimeout(180_000);
  await clearAllDesigns(page);
  await prepareDesign(page, { flavor: "mixed", title: "zoom-fps-perf" });
  // AFTER prepareDesign — emulateMedia before it leaves networkidle
  // permanently unsettled (known env gotcha, see WI-153 records).
  await page.emulateMedia({ reducedMotion: "reduce" });
  const n = await seedShapeGrid(page);
  expect(n).toBe(COLS * ROWS);
  // Let layout + the cull observer settle at the fit geometry.
  await page.waitForTimeout(1000);

  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  const zoom = await measureBurst(page, "zoom");
  // Settle (will-change drop + re-raster) between bursts.
  await page.waitForTimeout(600);
  const pan = await measureBurst(page, "pan");
  await page.waitForTimeout(600);
  // WI-198 — item-drag burst (per-pointermove document commits).
  const drag = await measureDragBurst(page);

  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  console.log(`PERF::${JSON.stringify({ items: n, cpuThrottle: CPU_THROTTLE, zoom, pan, drag })}`);
});
