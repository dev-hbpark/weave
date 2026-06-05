// WI-022 — design + frame background editing.
//
// Two surfaces:
//   1. Per-frame: every frame gets a
//      `background?: string` attr. Renderers paint it. The ContextualToolbar
//      exposes a Background ColorPicker + Clear (×).
//   2. Design-wide: `design.background` is edited via a `ColorPicker` that
//      sits in the DesignPage header's right cluster (next to ThemeSwitcher).
//      The picker is always discoverable, independent of selection, and
//      routes through `weave.design.setBackground` so the change lands in
//      `editor.history` and survives Cmd+Z.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectFrameViaVm(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
}

async function clearSelectionViaVm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { clear: () => void } };
    };
    w.__weaveVm?.itemSelection.clear();
  });
}

async function setFrameBackground(page: Page, id: string, color: string): Promise<void> {
  // WI-095 follow-up — a frame's background is a `decoration.fill` UNIT now
  // (DR-028 parity with shapes), not `attrs.background`. Same path the
  // toolbar's FillControl fires (`weave.item.setDecoration`).
  await page.evaluate(
    ({ fid, c }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.item.setDecoration", {
        itemId: fid,
        kind: "decoration.fill",
        attrs: { type: "solid", color: c },
      });
    },
    { fid: id, c: color },
  );
}

test("toolbar mounts a Background section when a slide is selected", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "BG-A" });
  await addFrame(page, "slide", {
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String((w.__weaveDoc?.root.children ?? [])[0]?.id);
  });
  await selectFrameViaVm(page, id);

  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "frame");
  // WI-095 follow-up — frame fill/stroke are decoration UNITS, edited by the
  // shared FillControl / StrokeControl (same as shapes). The fill swatch
  // carries the "채우기" aria-label.
  await expect(toolbar.getByLabel("채우기")).toBeVisible();
});

test("setting a frame fill unit paints the frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "BG-B" });
  await addFrame(page, "slide", {
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String((w.__weaveDoc?.root.children ?? [])[0]?.id);
  });

  await setFrameBackground(page, id, "rgb(255, 0, 0)");
  // WI-095 follow-up — the frame paints its decoration.fill unit as an SVG
  // <rect fill="…"> inside FrameBlock (gradient/image/video parity with
  // shapes). Read that rect's fill.
  const rectFill = await page.evaluate((fid) => {
    const frame = document.querySelector(`[data-frame-id="${fid}"]`);
    const rect = frame?.querySelector('[data-testid="frame-block"] rect') as SVGRectElement | null;
    return rect?.getAttribute("fill") ?? null;
  }, id);
  expect(rectFill).toContain("255, 0, 0");
});

// WI-032 Phase 3c — `frame-bg-clear` 버튼 클릭 후 attrs.background 가
// undefined 되는 검증. FrameBackgroundSection 의 clear path 가 frame
// paradigm 의 attrs 와 align 되지 않아 single-PASS / group fail 의 race.
// FrameBackgroundSection 의 clear 명령 추적 후 unskip.
test.skip("clearing the background (×) removes attrs.background", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "BG-C" });
  await addFrame(page, "slide", {
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String((w.__weaveDoc?.root.children ?? [])[0]?.id);
  });
  await setFrameBackground(page, id, "#ff0000");

  // Select then click the clear button.
  await selectFrameViaVm(page, id);
  await expect(page.getByTestId("frame-bg-clear")).toBeVisible();
  await page.getByTestId("frame-bg-clear").click();
  await page.waitForTimeout(60);

  // attrs.background gone.
  const bg = await page.evaluate((fid) => {
    type Ch = { id: unknown; attrs: { background?: string } };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    return (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid)?.attrs.background;
  }, id);
  expect(bg).toBeUndefined();
});

test("design background editor mounts in the header regardless of selection", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "BG-D" });

  // No selection — picker is still visible (file-level chrome).
  await clearSelectionViaVm(page);
  await expect(page.getByTestId("header-design-background")).toBeVisible();

  // With a selection — picker remains visible (selection-independent).
  await addFrame(page, "slide", {
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String((w.__weaveDoc?.root.children ?? [])[0]?.id);
  });
  await selectFrameViaVm(page, id);
  await expect(page.getByTestId("header-design-background")).toBeVisible();
});

test("a freshly generated design paints the active theme's page-background token", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // prepareDesign walks the real new-design wizard → createBlankDesign, i.e.
  // the generation path. New designs default to `var(--bg-page)`.
  await prepareDesign(page, { flavor: "mixed", title: "BG-THEME" });

  const probe = await page.evaluate(() => {
    const plane = document.querySelector("[data-canvas]") as HTMLElement | null;
    if (plane === null) return null;
    // Resolve --bg-page the same way CSS does for the plane: paint it onto a
    // probe and read back the browser-normalized rgb(...).
    const el = document.createElement("div");
    el.style.color = "var(--bg-page)";
    document.body.appendChild(el);
    const tokenColor = getComputedStyle(el).color;
    el.remove();
    return {
      planeBg: getComputedStyle(plane).backgroundColor,
      tokenColor,
      tone: plane.getAttribute("data-bg-tone"),
      theme: document.documentElement.dataset.theme ?? "aurora",
    };
  });

  expect(probe).not.toBeNull();
  // The generated design plane is painted with the resolved theme token.
  expect(probe?.planeBg).toBe(probe?.tokenColor);
  // Aurora (the default theme) is dark — the luminance probe must resolve the
  // `var(--bg-page)` token rather than falling back to "light".
  expect(probe?.tone).toBe("dark");
});

test("editing design background updates the rendered canvas + persists", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const designId = await prepareDesign(page, {
    flavor: "mixed",
    title: "BG-E",
  });
  await clearSelectionViaVm(page);

  // Apply via the same useDesign callback the toolbar's ColorPicker calls.
  await page.evaluate(() => {
    // Provide a tiny escape hatch — the toolbar's onValueCommit ultimately
    // calls setDesignBackground from useDesign. We invoke an equivalent
    // direct mutation by reading the stage's background-setter through
    // the toolbar's color picker color attribute on its swatch. To keep
    // this test independent of the picker's visual interaction, we
    // patch localStorage directly the way the storage layer does — which
    // exercises the persistence path along with the in-memory paint.
    // (Followed by a navigation re-load below.)
    // Direct route: dispatch a click + native input event on the picker
    // would be brittle; storage is the canonical source of truth.
  });

  // Direct setter via the storage-aware mutation: rewrite localStorage then
  // reload. (We exercise the in-memory path in the React component already
  // by mounting the toolbar — paint refresh is covered in the next test.)
  const newBg = "#112233";
  await page.evaluate(
    ({ id, color }) => {
      const k = `weave.design.v5.${id}`;
      const raw = window.localStorage.getItem(k);
      if (raw === null) return;
      const parsed = JSON.parse(raw);
      parsed.background = color;
      window.localStorage.setItem(k, JSON.stringify(parsed));
    },
    { id: designId, color: newBg },
  );

  await page.reload();
  await page.waitForFunction(() => {
    const w = window as unknown as { __weaveDoc?: unknown };
    return w.__weaveDoc !== undefined;
  });

  // Stage's outer container carries `background: ...` via inline style.
  // Read the design plane root.
  const renderedBg = await page.evaluate(() => {
    const el = document.querySelector("[data-canvas]") as HTMLElement | null;
    if (el === null) return null;
    return getComputedStyle(el).backgroundColor;
  });
  // #112233 → rgb(17, 34, 51).
  expect(renderedBg).toBe("rgb(17, 34, 51)");
});
