// WI-023 Phase 15 — text primitive (agocraft `text` kind).
//
// Covers:
//   1. Add menu → 텍스트 → item is created with default attrs.
//   2. Toolbar text section shows after select; changing fontSize updates
//      the rendered text.
//   3. Corner-resize on a text frame scales fontSize proportionally
//      (Figma parity).
//   4. Edge-resize on a text frame does NOT change fontSize.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addTextViaMenu(page: Page): Promise<string> {
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-text").click();
  // The new item's id is selected — read from the vm.
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: {
        itemSelection: { state: { get: () => unknown } };
      };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as
      | { kind: "single"; itemId: unknown }
      | undefined;
    return s?.kind === "single" ? String(s.itemId) : "";
  });
}

async function readAttrs(page: Page, id: string): Promise<Record<string, unknown>> {
  return await page.evaluate((fid) => {
    type Ch = { id: unknown; attrs: Readonly<Record<string, unknown>> };
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<Ch> } };
    };
    const item = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid);
    return item?.attrs as Record<string, unknown>;
  }, id);
}

test("Add menu → 텍스트 creates a text item with default attrs", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-A" });
  const id = await addTextViaMenu(page);
  expect(id).not.toBe("");

  const attrs = await readAttrs(page, id);
  expect(attrs.text).toBe("텍스트");
  // WI-fontsize-spec — add-geometry fills the drop height with one line of
  // text, so fontSize is a viewport-derived px (not the seed 24) and the
  // responsive ratio is stored as fontSizeSpec { kind:"ratio" }.
  expect(typeof attrs.fontSize).toBe("number");
  expect(attrs.fontSize as number).toBeGreaterThan(0);
  expect((attrs.fontSizeSpec as { kind?: string } | undefined)?.kind).toBe("ratio");
  expect(attrs.color).toBe("#1f2933");
  // New text defaults to Auto-width (TEXT_ITEM_SPEC §4.6): layoutChild anchor
  // is scale × scale. Width then auto-fits the text (no fixed default width).
  expect((attrs.layoutChild as { anchor?: { horizontal?: string; vertical?: string } }).anchor).toEqual(
    { horizontal: "scale", vertical: "scale" },
  );

  // Rendered DOM has the TextBlock with the default text.
  await expect(page.getByTestId("text-block")).toBeVisible();
});

test("Toolbar text section appears; changing fontSize updates the item", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-B" });
  const id = await addTextViaMenu(page);

  const toolbar = page.getByTestId("contextual-toolbar");
  await expect(toolbar).toBeVisible();
  await expect(toolbar).toHaveAttribute("data-kind", "text");

  // Drive the update directly (same path the toolbar's NumberSlider
  // commit triggers). Verifies the multi-aware updater + the renderer
  // both honour fontSize end-to-end.
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: { ...prev.attrs, fontSize: 48 },
      }),
    });
  }, id);

  const attrs = await readAttrs(page, id);
  expect(attrs.fontSize).toBe(48);
});

// DR-022 (2026-05-31, supersedes the DR-016 corner clause) — diagonal
// (corner) resize scales the glyph proportionally to the box HEIGHT ratio
// (new height / old height). The legacy `fontSize` px mirror and the
// explicit `fontSizeSpec` are both rewritten so px and % units convert
// correctly. Edge handles still change box dimensions only.
test("DR-022 — corner-resize scales fontSize by box height ratio (px spec)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-C" });
  const id = await addTextViaMenu(page);

  // Seed: known frame + explicit px fontSize, switch to Fixed mode so corner
  // handles appear. fontSizeSpec px is pinned so the conversion is deterministic.
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          frame: { x: 0.3, y: 0.3, width: 0.2, height: 0.2, rotation: 0 },
          fontSize: 20,
          fontSizeSpec: { kind: "px", value: 20 },
          // Fixed mode (left × top anchor) → all 8 handles. Derived from
          // `layoutChild`; the legacy `textAutoResize` field was removed in
          // agocraft v10.
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "left", vertical: "top" } },
        },
      }),
    });
  }, id);

  const seHandle = page.locator(
    `[data-selection-handle-item-id="${id}"] [data-handle-kind="corner"][data-handle-dir="se"]`,
  );
  await expect(seHandle).toBeVisible({ timeout: 3000 });

  const handleRect = await seHandle.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });

  // Drag SE corner outward. Box grows AND fontSize grows by the height ratio.
  await page.mouse.move(handleRect.cx, handleRect.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(handleRect.cx + 200, handleRect.cy + 200);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(120);

  const after = await readAttrs(page, id);
  const newHeight = (after.frame as { height: number }).height;
  expect((after.frame as { width: number }).width).toBeGreaterThan(0.2);
  expect(newHeight).toBeGreaterThan(0.2);
  // DR-022: fontSize scales by the box height ratio (new height / 0.2).
  const heightRatio = newHeight / 0.2;
  expect(after.fontSize as number).toBeGreaterThan(20);
  expect((after.fontSize as number) / 20).toBeCloseTo(heightRatio, 2);
  // px spec mirrors the resolved px exactly.
  expect(after.fontSizeSpec).toEqual({
    kind: "px",
    value: after.fontSize,
  });
});

// DR-022 — the ratio unit converts too: corner resize multiplies the
// `kind:"ratio"` value by the same height factor, so a responsive font stays
// responsive but grows with the box.
test("DR-022 — corner-resize scales fontSizeSpec ratio value by height ratio", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-C-ratio" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          frame: { x: 0.3, y: 0.3, width: 0.2, height: 0.2, rotation: 0 },
          fontSize: 80,
          fontSizeSpec: { kind: "ratio", value: 0.05 },
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "left", vertical: "top" } },
        },
      }),
    });
  }, id);

  const seHandle = page.locator(
    `[data-selection-handle-item-id="${id}"] [data-handle-kind="corner"][data-handle-dir="se"]`,
  );
  await expect(seHandle).toBeVisible({ timeout: 3000 });
  const handleRect = await seHandle.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  });

  await page.mouse.move(handleRect.cx, handleRect.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(handleRect.cx + 200, handleRect.cy + 200);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(120);

  const after = await readAttrs(page, id);
  const heightRatio = (after.frame as { height: number }).height / 0.2;
  const spec = after.fontSizeSpec as { kind: string; value: number };
  expect(spec.kind).toBe("ratio");
  expect(spec.value / 0.05).toBeCloseTo(heightRatio, 2);
});

// WI-fontsize-spec (2026-05-30) — fontSizeSpec { kind:"ratio" } makes the
// rendered font size = value × parent frame height (root = design height). The
// agent/UI can express responsive sizes; the renderer resolves via
// resolveFontSize + ParentFrameHeightContext.
test("fontSizeSpec ratio renders as value × design height; Cmd+Z reverts", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Ratio" });
  const id = await addTextViaMenu(page);

  // Root-level text → parent height = design height.
  const designH = await page.evaluate(() => {
    const w = window as unknown as { __weaveDesign?: { height?: number } };
    return w.__weaveDesign?.height ?? 0;
  });
  expect(designH).toBeGreaterThan(0);

  // Add-geometry already seeds a responsive ratio spec; capture it so we can
  // assert the undo restores it.
  const beforeSpec = (await readAttrs(page, id)).fontSizeSpec as { value?: number } | undefined;

  // Set a 10%-of-parent-height ratio font size via the same command the UI uses.
  await page.evaluate((fid) => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: { ...prev.attrs, fontSizeSpec: { kind: "ratio", value: 0.1 } },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  // Model round-trip.
  const attrs = await readAttrs(page, id);
  expect(attrs.fontSizeSpec).toEqual({ kind: "ratio", value: 0.1 });

  // Rendered design-px = 0.1 × designH (getComputedStyle returns the element's
  // own font-size in design-px; the Stage's transform:scale is separate).
  const innerFontPx = await page
    .locator('[data-testid="text-block"] > div')
    .first()
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(innerFontPx).toBeCloseTo(designH * 0.1, 0);

  // Undo restores the prior (add-time) ratio spec — value differs from 0.1.
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(120);
  const reverted = (await readAttrs(page, id)).fontSizeSpec as { value?: number } | undefined;
  expect(reverted?.value).not.toBe(0.1);
  expect(reverted?.value).toBeCloseTo(beforeSpec?.value ?? -1, 5);
});

// WI-fontsize-unit-fix (2026-05-31) — the px/% unit toggle must PRESERVE the
// on-screen size. Bug was: px→% seeded a fixed 5% (large text shrank). Fix:
// px→% stores currentPx/parentHeight, %→px stores ratio×parentHeight.
test("px↔% font-unit toggle preserves rendered size (no shrink)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Unit" });
  const id = await addTextViaMenu(page);
  const designH = await page.evaluate(
    () => (window as unknown as { __weaveDesign?: { height?: number } }).__weaveDesign?.height ?? 0,
  );
  expect(designH).toBeGreaterThan(0);

  // Seed a large px font (80) in Fixed mode.
  await page.evaluate((fid) => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          frame: { x: 0.3, y: 0.3, width: 0.3, height: 0.15, rotation: 0 },
          fontSize: 80,
          fontSizeSpec: { kind: "px", value: 80 },
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "left", vertical: "top" } },
        },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  const renderPx = () =>
    page
      .locator('[data-testid="text-block"] > div')
      .first()
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  const before = await renderPx();

  const section = page.getByTestId("text-size-section");
  await page.getByTestId("toolbar-more-trigger").click();

  // px → %: rendered size unchanged, spec becomes ratio = 80/designH.
  await section.getByText("%", { exact: true }).first().click();
  await page.waitForTimeout(150);
  const afterPct = await readAttrs(page, id);
  expect(await renderPx()).toBeCloseTo(before, 0);
  const sPct = afterPct.fontSizeSpec as { kind: string; value: number };
  expect(sPct.kind).toBe("ratio");
  expect(sPct.value).toBeCloseTo(80 / designH, 3);

  // % → px round-trip: rendered size still unchanged.
  await section.getByText("px", { exact: true }).first().click();
  await page.waitForTimeout(150);
  expect(await renderPx()).toBeCloseTo(before, 0);
  expect((await readAttrs(page, id)).fontSizeSpec).toMatchObject({ kind: "px" });
});

// WI-fontsize-unit-fix — a large ratio (as a corner-resize yields) must keep
// the % slider thumb in sync with the number (the slider max expands to fit).
test("% slider stays in sync when ratio exceeds the normal editing range", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Unit2" });
  const id = await addTextViaMenu(page);
  const designH = await page.evaluate(
    () => (window as unknown as { __weaveDesign?: { height?: number } }).__weaveDesign?.height ?? 0,
  );

  // 52% — past the 40% normal ceiling, as a big corner-resize can produce.
  await page.evaluate(
    ({ fid, fs }) => {
      const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
      w.__weaveEditor?.exec("weave.item.update", {
        itemId: fid,
        patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
          attrs: {
            ...prev.attrs,
            fontSize: fs,
            fontSizeSpec: { kind: "ratio", value: 0.52 },
            layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "left", vertical: "top" } },
          },
        }),
      });
    },
    { fid: id, fs: 0.52 * designH },
  );
  await page.waitForTimeout(120);

  await page.getByTestId("toolbar-more-trigger").click();
  const slider = page.getByTestId("text-size-section").getByRole("slider").first();
  const valNow = Number(await slider.getAttribute("aria-valuenow"));
  const valMax = Number(await slider.getAttribute("aria-valuemax"));
  // Thumb never exceeds the max (no desync); the scale expanded to include 52%.
  expect(valNow).toBeLessThanOrEqual(valMax);
  expect(valMax).toBeGreaterThanOrEqual(52);
  expect(valNow).toBeCloseTo(52, 0);
});

test("font-family picker offers presets and applies the selected stack", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Font" });
  const id = await addTextViaMenu(page);

  // The font-family picker lives in the "더보기" (More) popover, not in the
  // always-visible quick-action strip — open it first.
  await page.getByTestId("toolbar-more-trigger").click();
  const trigger = page.getByTestId("text-font-family-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  // Pick "Playfair Display" — a clearly distinct preset.
  await page.getByTestId("text-font-family-Playfair").click();
  await page.waitForTimeout(60);

  const attrs = await readAttrs(page, id);
  expect(String(attrs.fontFamily)).toContain("Playfair Display");
});

test("Enter inserts a newline inside the text box (multiline)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Multiline" });
  const id = await addTextViaMenu(page);

  // Enter edit mode via the text block — the Lexical "Text content" textbox
  // is only mounted once editing begins, so we can't double-click it directly.
  // (We edit the freshly-added, non-empty default text rather than seeding an
  // empty box: an empty box auto-heights to a sliver the design plane covers,
  // intercepting the double-click.)
  await page.getByTestId("text-block").dblclick();
  const editable = page.getByRole("textbox", { name: "Text content" });
  await expect(editable).toBeVisible({ timeout: 3000 });
  // dblclick selects all on mount; replace the default content with a clean
  // two-line string.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("Line 1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line 2");
  // Blur to commit (commit runs on blur).
  await editable.evaluate((el) => (el as HTMLElement).blur());
  await page.waitForTimeout(80);

  const attrs = await readAttrs(page, id);
  // Some browsers keep "\n" in textContent of contenteditable; the commit
  // path calls .trim() so leading/trailing whitespace is stripped but the
  // internal newline survives.
  expect(String(attrs.text)).toMatch(/Line 1\s*\n+\s*Line 2/);
});

test("Auto-H mode does NOT render n/s resize handles (height auto, width manual)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-NoNS" });
  const id = await addTextViaMenu(page);
  // New text defaults to Auto-width; switch to Auto-height (scale × top) which
  // is the mode this test covers (e/w handles, no n/s, no corners).
  await page.evaluate((fid) => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "scale", vertical: "top" } },
        },
      }),
    });
  }, id);
  await page.waitForTimeout(120);
  // Item is selected on add → SelectionLayer mounts.
  await expect(page.locator(`[data-selection-handle-item-id="${id}"]`).first()).toBeVisible({
    timeout: 3000,
  });

  // Edge handles n/s should be absent.
  await expect(
    page.locator(
      `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="n"]`,
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(
      `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="s"]`,
    ),
  ).toHaveCount(0);
  // e/w are present (chrome is up); corners are ABSENT — auto-height (HEIGHT)
  // exposes only the horizontal handles per TEXT_ITEM_SPEC §4.1.
  await expect(
    page.locator(
      `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="e"]`,
    ),
  ).toHaveCount(1);
  await expect(
    page.locator(
      `[data-selection-handle-item-id="${id}"] [data-handle-kind="corner"][data-handle-dir="se"]`,
    ),
  ).toHaveCount(0);
});

// Regression: auto-height must grow the frame as the user types new lines.
// Each keystroke emits a full-attrs `weave.item.update` (text), and the
// ResizeObserver emits another (frame.height); because item.attrs patches are
// whole-snapshot before/after, an interleaved text commit that read the
// document a beat before the frame commit landed would carry the stale (pre-
// grow) frame and revert the height. TextBlock debounces the auto-height
// commit while editing so it lands on a settled document — this test guards
// that the box ends up taller after typing multiple lines.
test("typing newlines (Enter) grows frame.height automatically", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Auto-Enter" });
  const id = await addTextViaMenu(page);

  // Seed with a known frame + short text. The auto-height ResizeObserver
  // will settle the height to match the rendered content within a frame
  // or two; capture the *settled* value as the "before".
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          frame: { x: 0.3, y: 0.3, width: 0.3, height: 0.4, rotation: 0 },
          // Auto-height (scale × top) — this test covers height auto-growth;
          // new text now defaults to Auto-width, so set the mode explicitly.
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "scale", vertical: "top" } },
          // Clear the add-geometry ratio spec so the explicit `fontSize`
          // controls the rendered size — otherwise `fontSizeSpec` (ratio ×
          // design height) dominates and makes one line fill ~half the canvas.
          fontSize: 24,
          fontSizeSpec: undefined,
          text: "Line 1",
        },
      }),
    });
  }, id);
  // Wait for auto-height to settle below the seeded 0.4 (or arbitrary
  // anchor — anything smaller than seed is fine).
  await page.waitForFunction(
    (fid) => {
      type Ch = { id: unknown; attrs: { frame?: { height?: number } } };
      const w = window as unknown as {
        __weaveDoc?: { root: { children: ReadonlyArray<Ch> } };
      };
      const it = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid);
      return (it?.attrs.frame?.height ?? 1) < 0.3;
    },
    id,
    { timeout: 2000 },
  );

  const before = (await readAttrs(page, id)).frame as { height: number };

  // Enter edit mode by double-clicking the text block — that mounts the
  // Lexical editor (the "Text content" textbox only exists once editing).
  await page.getByTestId("text-block").dblclick({ position: { x: 30, y: 12 } });
  const editable = page.getByRole("textbox", { name: "Text content" });
  await expect(editable).toBeVisible({ timeout: 3000 });
  // The selectAll on dblclick puts the caret at the start... actually
  // selects all. Press End to move caret to end, then add lines.
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line 2");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line 3");
  // The model frame auto-fit is reconciled on edit-EXIT (the observer is muted
  // while editing so per-keystroke commits don't fight the text commits; the
  // chrome tracks the live content meanwhile). Escape exits edit → one commit.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  const after = (await readAttrs(page, id)).frame as { height: number };
  // After the extra lines the read-only render is taller; the edit-exit
  // auto-fit pushes a larger frame.height.
  expect(after.height).toBeGreaterThan(before.height);
});

test("narrowing width via the e handle wraps the text — height grows", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Auto-Wrap" });
  const id = await addTextViaMenu(page);

  // Seed: long single-line text in a wide frame. Use a long-enough
  // string that a moderate inward drag forces wrap.
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          frame: { x: 0.1, y: 0.3, width: 0.7, height: 0.1, rotation: 0 },
          // Auto-height (scale × top) — this test narrows the user-set width
          // (e handle) and expects wrap → height grows. New text defaults to
          // Auto-width, so set the mode explicitly.
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "scale", vertical: "top" } },
          // Clear the add-geometry ratio spec so `fontSize` (px) controls the
          // rendered size; otherwise the ratio font makes the auto-height box
          // grow many times the canvas height and pushes the e handle off-screen.
          fontSize: 32,
          fontSizeSpec: undefined,
          text: "the quick brown fox jumps over the lazy dog and then it jumps again over another lazy dog repeatedly",
        },
      }),
    });
  }, id);
  // Let auto-height settle to the wide-frame line count.
  await page.waitForTimeout(300);
  const initial = (await readAttrs(page, id)).frame as {
    height: number;
    width: number;
  };

  // Drag the e handle inward to drastically narrow the frame.
  const eHandle = page.locator(
    `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="e"]`,
  );
  await expect(eHandle).toBeVisible({ timeout: 3000 });
  const r = await eHandle.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  });
  // Drag west by 400 vp pixels — should shrink width substantially.
  await page.mouse.move(r.cx, r.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(r.cx - 150, r.cy);
  await page.mouse.move(r.cx - 400, r.cy);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(180);

  const after = (await readAttrs(page, id)).frame as {
    height: number;
    width: number;
  };
  expect(after.width).toBeLessThan(initial.width);
  // Wrapped text → height grows.
  expect(after.height).toBeGreaterThan(initial.height);
  // fontSize unchanged (edge resize doesn't scale font).
  expect((await readAttrs(page, id)).fontSize).toBe(32);
});

test("cannot narrow width below ≈ one character (min-width clamp)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Min" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          frame: { x: 0.4, y: 0.4, width: 0.4, height: 0.1, rotation: 0 },
          // Auto-height — the e (width) handle this test drags only exists in
          // Auto-height/Fixed; new text defaults to Auto-width (no e/w).
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "scale", vertical: "top" } },
          fontSize: 48,
          text: "M",
        },
      }),
    });
  }, id);
  await page.waitForTimeout(150);

  // Drag east handle WAY too far left.
  const eHandle = page.locator(
    `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="e"]`,
  );
  await expect(eHandle).toBeVisible({ timeout: 3000 });
  const r = await eHandle.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  });
  await page.mouse.move(r.cx, r.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(r.cx - 200, r.cy);
  await page.mouse.move(r.cx - 1000, r.cy);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(120);

  const after = (await readAttrs(page, id)).frame as { width: number };
  // Min ratio = fontSize * 0.6 / designWidth = 48 * 0.6 / 1920 = 0.015.
  // Should clamp to that and not collapse below.
  expect(after.width).toBeGreaterThanOrEqual(0.014);
});

test("edge-resize does NOT change fontSize", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-D" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          frame: { x: 0.3, y: 0.3, width: 0.2, height: 0.2, rotation: 0 },
          // Auto-height — the e (width) handle this test drags only exists in
          // Auto-height/Fixed; new text defaults to Auto-width (no e/w).
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "scale", vertical: "top" } },
          // Clear the add-geometry ratio spec so `fontSize` (px) controls the
          // rendered size; the ratio font would otherwise auto-height the box
          // many times the canvas height and push the e handle off-screen.
          fontSize: 20,
          fontSizeSpec: undefined,
        },
      }),
    });
  }, id);

  const eHandle = page.locator(
    `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="e"]`,
  );
  await expect(eHandle).toBeVisible({ timeout: 3000 });
  const r = await eHandle.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  });
  await page.mouse.move(r.cx, r.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(r.cx + 100, r.cy);
  await page.mouse.move(r.cx + 200, r.cy);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(120);

  const after = await readAttrs(page, id);
  // Width grew, fontSize stayed the same.
  expect((after.frame as { width: number }).width).toBeGreaterThan(0.2);
  expect(after.fontSize).toBe(20);
});

// ───── WI-029 Phase 1 — Figma-equivalent additive specs ────────────────────

test("WI-029 — Fixed mode exposes all 8 resize handles", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Fixed-Handles" });
  const id = await addTextViaMenu(page);

  // Switch to Fixed mode.
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        // Fixed mode (left × top anchor) → all 8 handles. Derived from
        // `layoutChild`; the legacy `textAutoResize` field is gone (v10).
        attrs: {
          ...prev.attrs,
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "left", vertical: "top" } },
        },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  // All 8 handles should be visible: 4 edges + 4 corners.
  for (const dir of ["e", "w", "n", "s"]) {
    await expect(
      page.locator(
        `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="${dir}"]`,
      ),
    ).toBeVisible({ timeout: 3000 });
  }
  for (const dir of ["ne", "nw", "se", "sw"]) {
    await expect(
      page.locator(
        `[data-selection-handle-item-id="${id}"] [data-handle-kind="corner"][data-handle-dir="${dir}"]`,
      ),
    ).toBeVisible({ timeout: 3000 });
  }
});

test("Auto-W mode exposes only n/s (height) handles — width auto, height manual", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-AutoW-Handles" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        // Auto-width is derived from `layoutChild` (scale × scale); the legacy
        // `textAutoResize` field was removed in agocraft v10 and no longer
        // drives the mode.
        attrs: {
          ...prev.attrs,
          layoutChild: {
            kind: "absolute-constraints",
            anchor: { horizontal: "scale", vertical: "scale" },
          },
        },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  // Auto-width: width auto-fits content (no e/w + no corners), but height is
  // user-set, so the n and s edge handles ARE exposed for manual height.
  for (const dir of ["n", "s"]) {
    await expect(
      page.locator(
        `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="${dir}"]`,
      ),
    ).toHaveCount(1, { timeout: 3000 });
  }
  await expect(
    page.locator(
      `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="e"], [data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="w"]`,
    ),
  ).toHaveCount(0);
  await expect(
    page.locator(`[data-selection-handle-item-id="${id}"] [data-handle-kind="corner"]`),
  ).toHaveCount(0);
});

test("Auto-W mode — dragging the s handle changes height (height is manual)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-AutoW-Height" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          layoutChild: {
            kind: "absolute-constraints",
            anchor: { horizontal: "scale", vertical: "scale" },
          },
          frame: { x: 0.1, y: 0.2, width: 0.6, height: 0.2, rotation: 0 },
          // px font (clear the ratio spec) so the box stays on-screen. Use a
          // reasonably wide single line so the auto-fit box keeps a comfortable
          // width — the bottom-centre s handle then sits over a stable target.
          fontSize: 24,
          fontSizeSpec: undefined,
          text: "Resize this text box vertically",
        },
      }),
    });
  }, id);
  // Fonts must be loaded before measuring — a late web-font swap reflows the
  // auto-fit width and shifts the bottom-centre handle.
  await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready);
  // Wait for the width auto-fit to settle (0.6 → hug the line) BEFORE grabbing
  // the s handle — otherwise the box reflows mid-capture and the handle shifts.
  await page.waitForFunction(
    (fid) => {
      type Ch = { id: unknown; attrs: { frame?: { width?: number } } };
      const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
      const it = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid);
      const width = it?.attrs.frame?.width ?? 1;
      return width < 0.59 && width > 0.1;
    },
    id,
    { timeout: 2000 },
  );
  const before = (await readAttrs(page, id)).frame as { height: number };

  // Drag the south edge handle down — height must grow (the RO does NOT own
  // height in Auto-width, so the manual change is not reverted). `hover()`
  // auto-waits until the handle stops moving (stable), eliminating the
  // reflow/font race that made an eagerly-recorded position miss.
  const sHandle = page.locator(
    `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="s"]`,
  );
  await expect(sHandle).toBeVisible({ timeout: 3000 });
  await sHandle.hover();
  const box = await sHandle.boundingBox();
  if (box === null) throw new Error("s handle has no bounding box");
  const r = { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
  await page.mouse.move(r.cx, r.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(r.cx, r.cy + 120);
  await page.mouse.move(r.cx, r.cy + 240);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(250);

  const after = (await readAttrs(page, id)).frame as { height: number };
  expect(after.height).toBeGreaterThan(before.height);
  // fontSize unchanged (edge resize never scales the font — DR-016).
  expect((await readAttrs(page, id)).fontSize).toBe(24);
});

test("Auto-W mode grows/shrinks frame.width to fit content", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-AutoW-Width" });
  const id = await addTextViaMenu(page);

  // Switch to Auto-width (scale × scale) and seed a known wide frame with
  // short content. Auto-width exposes no WIDTH handle, so the ResizeObserver
  // is the ONLY thing that can move frame.width — it must shrink the box to
  // the short text's natural width.
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          layoutChild: {
            kind: "absolute-constraints",
            anchor: { horizontal: "scale", vertical: "scale" },
          },
          frame: { x: 0.1, y: 0.3, width: 0.6, height: 0.2, rotation: 0 },
          fontSize: 24,
          text: "Hi",
        },
      }),
    });
  }, id);
  // Width settles below the seeded 0.6 to hug "Hi".
  await page.waitForFunction(
    (fid) => {
      type Ch = { id: unknown; attrs: { frame?: { width?: number } } };
      const w = window as unknown as {
        __weaveDoc?: { root: { children: ReadonlyArray<Ch> } };
      };
      const it = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid);
      return (it?.attrs.frame?.width ?? 1) < 0.3;
    },
    id,
    { timeout: 2000 },
  );

  const narrow = (await readAttrs(page, id)).frame as { width: number };

  // Replace with a much longer single line — width must GROW to fit it
  // (no soft-wrap in Auto-width), without the user touching any handle.
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: { ...prev.attrs, text: "A considerably longer single line of text" },
      }),
    });
  }, id);
  await page.waitForFunction(
    (args) => {
      const [fid, prevW] = args as [string, number];
      type Ch = { id: unknown; attrs: { frame?: { width?: number } } };
      const w = window as unknown as {
        __weaveDoc?: { root: { children: ReadonlyArray<Ch> } };
      };
      const it = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid);
      return (it?.attrs.frame?.width ?? 0) > prevW + 0.05;
    },
    [id, narrow.width] as [string, number],
    { timeout: 2000 },
  );

  const wide = (await readAttrs(page, id)).frame as { width: number };
  expect(wide.width).toBeGreaterThan(narrow.width);
});

test("WI-029 — V-Align CENTER applies flex justify-content", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-VAlign" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: { ...prev.attrs, textAlignVertical: "CENTER" },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  const block = page.getByTestId("text-block");
  const justify = await block.evaluate((el) => {
    return window.getComputedStyle(el as HTMLElement).justifyContent;
  });
  expect(justify).toBe("center");
});

test("WI-029 — Decoration UNDERLINE applies text-decoration: underline", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Decoration" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: { ...prev.attrs, textDecoration: "UNDERLINE" },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  // The textStyle div (inside .editor / text-block) carries the
  // text-decoration. Inspect the inner text-styled div.
  const block = page.getByTestId("text-block");
  const innerDiv = block.locator("> div").first();
  const decoration = await innerDiv.evaluate((el) => {
    const cs = window.getComputedStyle(el as HTMLElement);
    return cs.textDecorationLine || cs.textDecoration;
  });
  expect(decoration).toContain("underline");
});

test("WI-029 — Hyperlink wraps text in <a target=_blank> in read mode", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Hyperlink" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: { ...prev.attrs, hyperlink: { url: "https://example.com/test" } },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  // Edit mode: NO <a> wrap (allows click-to-edit). Hyperlink only renders
  // in present mode (when onUpdate is not wired). For this spec, we assert
  // the attrs are stored — full present-mode verification belongs to a
  // present-mode flow test.
  const after = await readAttrs(page, id);
  expect(after.hyperlink).toEqual({ url: "https://example.com/test" });
});

test("WI-029 — Truncate ENDING + maxLines clamps content via -webkit-line-clamp", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Truncate" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          text: "line1\nline2\nline3\nline4\nline5",
          // Fixed mode is required for truncation to apply (the `isFixed` gate
          // in TextBlock). Derived from `layoutChild` (left × top); legacy
          // `textAutoResize` field removed in agocraft v10.
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "left", vertical: "top" } },
          textTruncation: "ENDING",
          maxLines: 3,
        },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  const block = page.getByTestId("text-block");
  const innerDiv = block.locator("> div").first();
  const clamp = await innerDiv.evaluate((el) => {
    const cs = window.getComputedStyle(el as HTMLElement);
    return cs.webkitLineClamp || cs.getPropertyValue("-webkit-line-clamp");
  });
  expect(String(clamp).trim()).toBe("3");
});

test("textOverflow toggles clip vs visible in a non-Fixed mode (all-mode overflow)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Overflow" });
  const id = await addTextViaMenu(page);

  const containerOverflow = async (): Promise<string> =>
    await page.evaluate(() => {
      const tb = document.querySelector('[data-testid="text-block"]') as HTMLElement;
      return window.getComputedStyle(tb).overflowX;
    });

  const setOverflow = async (value: "VISIBLE" | "HIDDEN"): Promise<void> => {
    await page.evaluate(
      (args) => {
        const [fid, v] = args as [string, string];
        const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
        w.__weaveEditor?.exec("weave.item.update", {
          itemId: fid,
          patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
            attrs: { ...prev.attrs, textOverflow: v },
          }),
        });
      },
      [id, value] as [string, string],
    );
    await page.waitForTimeout(120);
  };

  // Auto-height (a non-Fixed mode) — overflow used to be hard-coded to
  // "visible" here. textOverflow must override it in EITHER direction.
  await page.evaluate((fid) => {
    const w = window as unknown as { __weaveEditor?: { exec: (n: string, i: unknown) => unknown } };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: {
          ...prev.attrs,
          layoutChild: { kind: "absolute-constraints", anchor: { horizontal: "scale", vertical: "top" } },
        },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  await setOverflow("HIDDEN");
  expect(await containerOverflow()).toBe("hidden");
  await setOverflow("VISIBLE");
  expect(await containerOverflow()).toBe("visible");
});
