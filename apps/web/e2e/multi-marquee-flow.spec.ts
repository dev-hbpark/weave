// WI-021 — full marquee → shift+click + union-bbox geometry.
//
// Two regressions this exercises:
//   1. After a real (large) marquee drag the browser may suppress the
//      synthesized click. Our click-swallower must not persist past the
//      end of the current task, otherwise the user's NEXT click — e.g.
//      Shift+click on a frame to toggle multi — is eaten.
//   2. The multi-selection union chrome must align with the actual
//      bounding rect of every selected frame. We marquee three frames at
//      known positions, then compare the chrome's getBoundingClientRect
//      against the union of each frame's getBoundingClientRect.

import { expect, test, type Page } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectedIds(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { items: () => ReadonlyArray<unknown> } };
    };
    return (w.__weaveVm?.itemSelection.items() ?? [])
      .map((x) => String(x))
      .sort();
  });
}

async function frameRect(
  page: Page,
  id: string,
): Promise<{ left: number; top: number; right: number; bottom: number }> {
  return await page.evaluate((fid) => {
    const el = document.querySelector(`[data-frame-id="${fid}"]`) as HTMLElement | null;
    if (el === null) throw new Error(`frame ${fid} not found`);
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }, id);
}

async function chromeRect(
  page: Page,
): Promise<{ left: number; top: number; right: number; bottom: number }> {
  return await page.evaluate(() => {
    const el = document.querySelector(
      "[data-testid='multi-selection-chrome']",
    ) as HTMLElement | null;
    if (el === null) throw new Error("chrome not found");
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

test("real marquee → Shift+click toggles a member out (swallower doesn't eat the click)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Marquee-Shift" });
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.65, y: 0.1, width: 0.25, height: 0.25, rotation: 0 },
  });

  // Real marquee covering both — use a viewport-spanning drag.
  const vp = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  await page.mouse.move(Math.floor(vp.w * 0.05), Math.floor(vp.h * 0.18));
  await page.mouse.down({ button: "left" });
  await page.mouse.move(Math.floor(vp.w * 0.5), Math.floor(vp.h * 0.4));
  await page.mouse.move(Math.floor(vp.w * 0.95), Math.floor(vp.h * 0.6));
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(60);

  const both = await selectedIds(page);
  expect(both.length).toBe(2);

  // The first selected frame's id (sorted alphabetically — depends on the
  // generator's monotonic suffix). Just take whichever the doc has at
  // index 0 of the two seeded slides — we'll use `data-frame-id` to find
  // its on-screen position.
  const targetId = both[0] as string;

  // Shift+click on that frame's body. The marquee's swallower was just
  // installed on pointerup; if its lifetime is bounded, this click
  // reaches NestedFrame.onClick and toggles.
  const r = await frameRect(page, targetId);
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  await page.keyboard.down("Shift");
  await page.mouse.click(cx, cy);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(40);

  // The target was removed from the multi.
  const after = await selectedIds(page);
  expect(after).not.toContain(targetId);
  expect(after.length).toBe(1);
});

test("union chrome (after REAL marquee drag) matches the bbox of every selected frame", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Union-Drag" });

  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.55, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.35, y: 0.55, width: 0.2, height: 0.2, rotation: 0 },
  });
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });

  // Drive selection via the REAL marquee — what the user is actually
  // doing in the browser. Large viewport-spanning drag covers all 3.
  const vp = await page.evaluate(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  await page.mouse.move(Math.floor(vp.w * 0.05), Math.floor(vp.h * 0.18));
  await page.mouse.down({ button: "left" });
  await page.mouse.move(Math.floor(vp.w * 0.5), Math.floor(vp.h * 0.5));
  await page.mouse.move(Math.floor(vp.w * 0.95), Math.floor(vp.h * 0.9));
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(80);
  expect((await selectedIds(page)).length).toBe(ids.length);

  // Geometry check — same tolerance as the programmatic case.
  const rs = await Promise.all(ids.map((id) => frameRect(page, id)));
  const unionExpected = {
    left: Math.min(...rs.map((r) => r.left)),
    top: Math.min(...rs.map((r) => r.top)),
    right: Math.max(...rs.map((r) => r.right)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  };
  const chrome = await chromeRect(page);
  const TOL = 2;
  expect(Math.abs(chrome.left - unionExpected.left)).toBeLessThan(TOL);
  expect(Math.abs(chrome.top - unionExpected.top)).toBeLessThan(TOL);
  expect(Math.abs(chrome.right - unionExpected.right)).toBeLessThan(TOL);
  expect(Math.abs(chrome.bottom - unionExpected.bottom)).toBeLessThan(TOL);
});

test("union chrome follows the frames during a multi-drag", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Union-Drag-Follow" });

  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.55, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });

  await page.evaluate((arr) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(arr);
  }, ids);
  await page.waitForFunction(
    (n) => {
      const w = window as unknown as {
        __weaveVm?: { itemSelection: { items: () => ReadonlyArray<unknown> } };
      };
      return (w.__weaveVm?.itemSelection.items().length ?? 0) === n;
    },
    ids.length,
  );

  // Drag frame 0 by ~120 px right, ~60 px down. Both frames should move.
  const r = await frameRect(page, ids[0] as string);
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(cx + 40, cy + 20);
  await page.mouse.move(cx + 120, cy + 60);
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(80);

  // Selection preserved; chrome geometry now matches new union.
  expect((await selectedIds(page)).length).toBe(ids.length);
  const rs = await Promise.all(ids.map((id) => frameRect(page, id)));
  const unionExpected = {
    left: Math.min(...rs.map((r) => r.left)),
    top: Math.min(...rs.map((r) => r.top)),
    right: Math.max(...rs.map((r) => r.right)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  };
  const chrome = await chromeRect(page);
  const TOL = 2;
  expect(Math.abs(chrome.left - unionExpected.left)).toBeLessThan(TOL);
  expect(Math.abs(chrome.top - unionExpected.top)).toBeLessThan(TOL);
  expect(Math.abs(chrome.right - unionExpected.right)).toBeLessThan(TOL);
  expect(Math.abs(chrome.bottom - unionExpected.bottom)).toBeLessThan(TOL);
});

test("union chrome includes a nested selected item (not just root.children)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Union-Nested" });

  // One slide at root.
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.4, height: 0.4, rotation: 0 },
  });
  const slideId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String((w.__weaveDoc?.root.children ?? [])[0]?.id);
  });

  // One shape nested INSIDE the slide. addFrame with explicit containerId.
  await page.evaluate(({ parentId }) => {
    const w = window as unknown as {
      __weaveEditor?: {
        exec: (n: string, i: unknown) => unknown;
      };
    };
    w.__weaveEditor?.exec("weave.item.add", {
      kind: "shape",
      containerId: parentId,
      frame: { x: 0.1, y: 0.1, width: 0.6, height: 0.6, rotation: 0 },
      attrsOverride: {
        shape: "rectangle",
        fill: { type: "solid", color: "#ff0000" },
      },
    });
  }, { parentId: slideId });

  // Find the nested shape's id.
  const shapeId = await page.evaluate((sid) => {
    type Ch = { id: unknown; kind: string; children: ReadonlyArray<{ id: unknown; kind: string }> };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    const slide = w.__weaveDoc?.root.children.find((c) => String(c.id) === sid);
    const shape = slide?.children.find((c) => c.kind === "shape");
    return shape ? String(shape.id) : "";
  }, slideId);
  expect(shapeId).not.toBe("");

  // Multi-select the slide AND the nested shape via the vm — simulating
  // what shift-click on the nested item would do.
  await page.evaluate((arr) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(arr);
  }, [slideId, shapeId]);
  await page.waitForFunction(() => {
    return document.querySelector(
      "[data-testid='multi-selection-chrome']",
    ) !== null;
  });

  // The chrome should include the shape's bounding rect too. Since the
  // shape lives inside the slide and is 0.6 of its parent, the union
  // matches the slide's outer bounds (shape fits inside).
  const slideR = await frameRect(page, slideId);
  const chrome = await chromeRect(page);
  const TOL = 2;
  expect(Math.abs(chrome.left - slideR.left)).toBeLessThan(TOL);
  expect(Math.abs(chrome.top - slideR.top)).toBeLessThan(TOL);
  expect(Math.abs(chrome.right - slideR.right)).toBeLessThan(TOL);
  expect(Math.abs(chrome.bottom - slideR.bottom)).toBeLessThan(TOL);
  // And the count is 2 even though only one is at root.
  await expect(page.getByTestId("multi-selection-chrome")).toHaveAttribute(
    "data-count",
    "2",
  );
});

test("union chrome (programmatic) matches the bbox of every selected frame", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Union-Geom" });

  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.55, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.35, y: 0.55, width: 0.2, height: 0.2, rotation: 0 },
  });
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });
  expect(ids.length).toBe(3);

  // Programmatic multi-select to avoid marquee gesture variance — the
  // chrome geometry is independent of HOW the selection got there.
  await page.evaluate((arr) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(arr);
  }, ids);
  await page.waitForFunction(
    () => {
      return document.querySelector(
        "[data-testid='multi-selection-chrome']",
      ) !== null;
    },
    null,
    { timeout: 2000 },
  );

  // Compute the union of each frame's viewport bounding rect.
  const rs = await Promise.all(ids.map((id) => frameRect(page, id)));
  const unionExpected = {
    left: Math.min(...rs.map((r) => r.left)),
    top: Math.min(...rs.map((r) => r.top)),
    right: Math.max(...rs.map((r) => r.right)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  };
  const chrome = await chromeRect(page);
  // Allow ~1px tolerance for sub-pixel rounding under the camera scale.
  const TOL = 2;
  expect(Math.abs(chrome.left - unionExpected.left)).toBeLessThan(TOL);
  expect(Math.abs(chrome.top - unionExpected.top)).toBeLessThan(TOL);
  expect(Math.abs(chrome.right - unionExpected.right)).toBeLessThan(TOL);
  expect(Math.abs(chrome.bottom - unionExpected.bottom)).toBeLessThan(TOL);
});
