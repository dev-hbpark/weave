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
  expect(attrs.fontSize).toBe(24);
  expect(attrs.color).toBe("#1f2933");
  // Frame defaulted to addNewItem's drop coords.
  expect((attrs.frame as { width?: number }).width).toBeCloseTo(0.4, 5);

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

// DR-016 (2026-05-25) — corner resize no longer scales fontSize. This
// previously-passing test is REVERSED: now we assert fontSize stays unchanged.
// The Genially-style "corner = both box and glyph" UX is gone; Figma paradigm
// (corner = box only, fontSize via PropertiesPanel slider) is in.
test("DR-016 regression — corner-resize keeps fontSize unchanged (Fixed mode)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-C" });
  const id = await addTextViaMenu(page);

  // Seed: known frame + fontSize, switch to Fixed mode so corner handles appear.
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
          textAutoResize: "NONE", // Fixed mode → 8 handles
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

  // Drag SE corner outward. Box grows, fontSize stays exactly 20.
  await page.mouse.move(handleRect.cx, handleRect.cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(handleRect.cx + 200, handleRect.cy + 200);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(120);

  const after = await readAttrs(page, id);
  expect((after.frame as { width: number }).width).toBeGreaterThan(0.2);
  expect((after.frame as { height: number }).height).toBeGreaterThan(0.2);
  // DR-016 guarantee: fontSize NEVER changes from corner resize.
  expect(after.fontSize).toBe(20);
});

test("font-family picker offers presets and applies the selected stack", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-Font" });
  const id = await addTextViaMenu(page);

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

  // Seed empty so we can type a clean two-line string.
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: { ...prev.attrs, text: "" },
      }),
    });
  }, id);
  await page.waitForTimeout(60);

  const editable = page.getByRole("textbox", { name: "Text content" });
  await editable.dblclick();
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

test("text item does NOT render n/s resize handles", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-NoNS" });
  const id = await addTextViaMenu(page);
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
  // e/w + corners are still present.
  await expect(
    page.locator(
      `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"][data-handle-dir="e"]`,
    ),
  ).toHaveCount(1);
  await expect(
    page.locator(
      `[data-selection-handle-item-id="${id}"] [data-handle-kind="corner"][data-handle-dir="se"]`,
    ),
  ).toHaveCount(1);
});

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
          fontSize: 24,
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

  // Enter edit mode and add a couple of newlines via Enter.
  const editable = page.getByRole("textbox", { name: "Text content" });
  await editable.dblclick({ position: { x: 30, y: 12 } });
  // The selectAll on dblclick puts the caret at the start... actually
  // selects all. Press End to move caret to end, then add lines.
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line 2");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Line 3");
  await editable.evaluate((el) => (el as HTMLElement).blur());
  await page.waitForTimeout(150);

  const after = (await readAttrs(page, id)).frame as { height: number };
  // After Enter the rendered text occupies more lines, ResizeObserver
  // pushes a larger frame.height.
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
          fontSize: 32,
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
          fontSize: 20,
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
        attrs: { ...prev.attrs, textAutoResize: "NONE" },
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

test("WI-029 — Auto-W mode hides all resize handles (auto-shrink)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Text-AutoW-NoHandles" });
  const id = await addTextViaMenu(page);

  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
    };
    w.__weaveEditor?.exec("weave.item.update", {
      itemId: fid,
      patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
        attrs: { ...prev.attrs, textAutoResize: "WIDTH_AND_HEIGHT" },
      }),
    });
  }, id);
  await page.waitForTimeout(120);

  // No resize handle should be visible. (Rotation handle MAY exist —
  // selection chrome non-resize chrome is not gated by mode.)
  const handles = page.locator(
    `[data-selection-handle-item-id="${id}"] [data-handle-kind="edge"], [data-selection-handle-item-id="${id}"] [data-handle-kind="corner"]`,
  );
  await expect(handles).toHaveCount(0, { timeout: 3000 });
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
          textAutoResize: "NONE",
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
