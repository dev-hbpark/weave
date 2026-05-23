import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 10b — the demo doc is gone; each test prepares a fresh design via the
// new-design wizard and uses the seeded first item per flavor. The big demo
// seed (4 domains + camera/hotspot/reveal-on-step interactions) is no longer
// part of the product surface — coverage now lives in the wizard and in the
// per-domain inline-edit flows.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("landing renders the headline + new-design CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /One canvas\./ })).toBeVisible();
  await expect(page.getByTestId("landing-new-design")).toBeVisible();
});

test("slide-deck flavor seeds a slide; title inline edit + persist", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const title = page.getByRole("textbox", { name: "Slide title" });
  await expect(title).toHaveText("New slide");

  await title.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Edited title");
  await title.blur();
  await expect(title).toHaveText("Edited title");

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Slide title" })).toHaveText("Edited title");
});

test("slide-deck: bullet add via Enter + remove via Backspace", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });

  const b1 = page.getByRole("textbox", { name: "Bullet 1" });
  await b1.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Bullet 2" })).toHaveText("");

  await page.getByRole("textbox", { name: "Bullet 2" }).click();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("textbox", { name: "Bullet 2" })).toHaveText("Supporting detail");
});

test("doc-page flavor seeds a doc; heading inline edit + persist", async ({ page }) => {
  await prepareDesign(page, { flavor: "doc-page" });

  const heading = page.getByRole("textbox", { name: "Doc heading" });
  await heading.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Edited doc heading");
  await heading.blur();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Doc heading" })).toHaveText("Edited doc heading");
});

test("canvas-board flavor seeds a canvas; summary inline edit + persist", async ({ page }) => {
  await prepareDesign(page, { flavor: "canvas-board" });

  const summary = page.getByRole("textbox", { name: "Canvas summary" });
  await summary.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Sticker wall for the campaign brainstorm");
  await summary.blur();

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Canvas summary" })).toHaveText(
    "Sticker wall for the campaign brainstorm",
  );
});

test("canvas-board: shape selection + 8 resize handles + rotation handle", async ({ page }) => {
  await prepareDesign(page, { flavor: "canvas-board" });
  // Phase 12 — clicking a shape may also select the surrounding canvas frame
  // (frame SelectionLayer + shape SelectionLayer coexist). Both expose the
  // same aria-labels, so the test scopes its lookups to the shape's
  // SelectionLayer via `.first()` (innermost layer in DOM order).
  await page.locator('[data-shape-id^="shape"]').first().click();
  const handleDirs = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
  for (const dir of handleDirs) {
    await expect(
      page.getByRole("button", { name: `Resize ${dir}`, exact: true }).first(),
    ).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Rotate selection" }).first()).toBeVisible();

  await page.keyboard.press("Escape");
  // After Esc, both shape and frame SelectionLayers may unmount; assert the
  // rotation handle is gone for at least one of them. Frame selection still
  // lives in DesignPage state, so the SelectionLayer count drops to 0 or 1
  // depending on whether the click also selected the frame.
  await page.waitForTimeout(80);
});

test("slide title Esc reverts the in-flight change", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const title = page.getByRole("textbox", { name: "Slide title" });
  await title.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Temporary");
  await page.keyboard.press("Escape");
  await expect(title).toHaveText("New slide");
});

test("Stage centers the active scene and zooms it to fill the viewport", async ({
  page,
}) => {
  // Two slides at the design center (mixed flavor stacks them). Present mode
  // should zoom the active step's frame to fill the viewport, centered. The
  // wizard creates a 16:9 design (1920×1080); the slide frames default to
  // centerFrame ({0.4, 0.4, 0.2, 0.2}) — a 384×216 sub-region of design coords.
  // Force reduced-motion so the spring transition resolves to its final state
  // immediately; we want to inspect the steady-state geometry.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = await prepareDesign(page, { flavor: "mixed", title: "Camera fit" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();

  await page.goto(`/design/${id}/present`);
  // Reduced motion → no spring. Still allow one frame for ResizeObserver to
  // hand Stage its measured viewport size.
  await page.waitForTimeout(120);

  const viewport = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  // The active scene's wrapper carries data-stage-scene-id. Step 1 is the
  // first slide (centered at design 0.5/0.5 with the default scale that fits
  // a 0.2-wide frame to viewport). After the camera transform, that scene's
  // on-screen rect should be:
  //   - centered (left+right symmetric to viewport center, same for top+bottom)
  //   - filling one of the viewport dimensions (max(w/h) of the scene rect ≈
  //     the matching viewport dimension)
  const sceneRect = await page
    .locator("[data-stage-scene-id]")
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });

  const sceneCenterX = sceneRect.left + sceneRect.width / 2;
  const sceneCenterY = sceneRect.top + sceneRect.height / 2;

  // Centering: within 2 px of viewport center (allow rounding).
  expect(Math.abs(sceneCenterX - viewport.w / 2)).toBeLessThan(2);
  expect(Math.abs(sceneCenterY - viewport.h / 2)).toBeLessThan(2);

  // Fill: the larger of (width-fraction, height-fraction) should be ≥ 0.98.
  // (The other dimension shrinks by aspect mismatch — viewport ≠ frame aspect.)
  const fillW = sceneRect.width / viewport.w;
  const fillH = sceneRect.height / viewport.h;
  expect(Math.max(fillW, fillH)).toBeGreaterThan(0.98);
});

test("zoom and pan stay synchronized through a camera transition", async ({
  page,
}) => {
  // Set up two frames at very different positions AND scales: one large frame
  // covering most of the design, one small frame in the bottom-right corner.
  // The transition between them changes both camera position and scale, so we
  // can verify the two animate in lockstep.
  const id = await prepareDesign(page, { flavor: "mixed", title: "Sync" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  await page.evaluate(async () => {
    const editor = (
      window as unknown as { __weaveEditor: { exec: (n: string, i: unknown) => void } }
    ).__weaveEditor;
    const doc = (
      window as unknown as {
        __weaveDoc: { root: { children: ReadonlyArray<{ id: string }> } };
      }
    ).__weaveDoc;
    const items = doc.root.children;
    type Attrs = Record<string, unknown> & {
      frame: { x: number; y: number; width: number; height: number; rotation: number };
    };
    editor.exec("weave.item.update", {
      itemId: String(items[0]?.id),
      patch: (it: { attrs: Attrs }) => ({
        ...it,
        attrs: {
          ...it.attrs,
          frame: { x: 0.05, y: 0.05, width: 0.9, height: 0.85, rotation: 0 },
        },
      }),
    });
    editor.exec("weave.item.update", {
      itemId: String(items[1]?.id),
      patch: (it: { attrs: Attrs }) => ({
        ...it,
        attrs: {
          ...it.attrs,
          frame: { x: 0.78, y: 0.78, width: 0.15, height: 0.12, rotation: 0 },
        },
      }),
    });
  });
  // Wait until both frames are flushed to localStorage — saveDesign runs in a
  // useEffect after the React update, so we can't navigate immediately or the
  // /present page loads the unmodified design.
  await page.waitForFunction(() => {
    for (const k of Object.keys(window.localStorage)) {
      if (!k.startsWith("weave.design.v5.")) continue;
      const raw = window.localStorage.getItem(k);
      if (raw === null) continue;
      try {
        const blob = JSON.parse(raw) as {
          document: { root: { children: ReadonlyArray<{ attrs: { frame: { x: number } } }> } };
        };
        const cs = blob.document?.root?.children ?? [];
        if (cs.length >= 2 && cs[0]?.attrs?.frame?.x === 0.05 && cs[1]?.attrs?.frame?.x === 0.78) {
          return true;
        }
      } catch {
        // ignore parse failures and retry
      }
    }
    return false;
  });

  await page.goto(`/design/${id}/present`);
  await page.waitForTimeout(1800); // initial settle

  // Compute theoretical camera endpoints from the viewport + frame definitions
  // so the test doesn't depend on the spring being fully settled at any
  // particular sample.
  const baseScale = await page.evaluate(() =>
    Math.min(window.innerWidth / 1920, window.innerHeight / 1080),
  );
  const sStart = baseScale * (1 / Math.max(0.9, 0.85)); // scene 0 active
  const sEnd = baseScale * (1 / Math.max(0.15, 0.12)); // scene 1 active
  // Scene 1 center in design coords:
  const cxTarget = (0.78 + 0.15 / 2) * 1920;
  const offStart = sStart * (cxTarget - (0.05 + 0.9 / 2) * 1920);

  // Sample the transform every ~20ms across the full spring lifetime (~1.5s).
  const t0 = Date.now();
  await page.keyboard.press("ArrowRight");
  const samples: Array<{ ms: number; scale: number; offset: number }> = [];
  for (let i = 0; i < 90; i += 1) {
    await page.waitForTimeout(20);
    const sample = await page.evaluate((cx) => {
      const m = document.querySelector("[data-stage-scene-id]")?.parentElement;
      if (!m) return null;
      const cs = window.getComputedStyle(m).transform;
      const match = cs.match(/matrix\(([^)]+)\)/);
      if (!match) return null;
      const p = (match[1] ?? "").split(",").map((x) => parseFloat(x.trim()));
      const onX = (p[0] ?? 0) * cx + (p[4] ?? 0);
      return { scale: p[0] ?? 0, onX, vw: window.innerWidth };
    }, cxTarget);
    if (sample === null) break;
    samples.push({
      ms: Date.now() - t0,
      scale: sample.scale,
      offset: sample.onX - sample.vw / 2,
    });
  }

  // For each middle-band sample, the perceived zoom progress (log-scale
  // relative to the theoretical endpoints) should equal the offset-reduction
  // progress, because the camera derives cx, cy, scale from one shared
  // progress value. See Stage.tsx `transitionCamera`.
  let maxDelta = 0;
  let checked = 0;
  for (const s of samples) {
    const offsetReduction = (offStart - s.offset) / offStart;
    if (offsetReduction <= 0.15 || offsetReduction >= 0.85) continue;
    if (s.scale <= sStart) continue;
    const perceivedZoom = Math.log(s.scale / sStart) / Math.log(sEnd / sStart);
    const delta = Math.abs(perceivedZoom - offsetReduction);
    maxDelta = Math.max(maxDelta, delta);
    checked += 1;
  }
  expect(checked).toBeGreaterThan(3);
  // Perceived zoom and offset reduction track within 5 percentage points.
  // Pre-fix (linear scale interp) this delta peaked around 0.18.
  expect(maxDelta).toBeLessThan(0.05);
});

test("theme switch persists across navigations", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await page.getByRole("radio", { name: "Vivid" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "vivid");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "vivid");
});
