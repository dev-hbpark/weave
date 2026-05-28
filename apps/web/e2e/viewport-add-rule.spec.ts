// Add-to-root placement rule.
//
// When an item is added directly to the design root (tool hotkey / toolbar
// with nothing selected), it lands centred in the CURRENT viewport at a
// fraction of the visible area — 40% per axis for normal items, 30% tall
// for text — independent of pan / zoom. Text font fills that height and is
// stored as `fontSizeRatio` (ratio of the parent/design height) plus the
// derived px the renderer reads.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, readItemFrame } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __weaveVm?: { itemSelection: { clear: () => void } } };
    w.__weaveVm?.itemSelection.clear();
  });
}

/** Clear the selection (so the add targets the root) then press a tool
 *  hotkey, returning the newly added (auto-selected) item id. */
async function addToRoot(page: Page, key: "KeyR" | "KeyT" | "KeyF"): Promise<string> {
  const before = await selectedId(page);
  await clearSelection(page);
  await page.keyboard.press(key);
  await expect
    .poll(async () => {
      const s = await selectedId(page);
      return s !== undefined && s !== before ? s : undefined;
    })
    .not.toBeUndefined();
  return (await selectedId(page)) as string;
}

async function selectedId(page: Page): Promise<string | undefined> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { items: () => ReadonlyArray<unknown> } };
    };
    const ids = w.__weaveVm?.itemSelection.items() ?? [];
    return ids.length > 0 ? String(ids[0]) : undefined;
  });
}

async function readAttrs(page: Page, id: string): Promise<Record<string, unknown> | null> {
  return await page.evaluate((targetId) => {
    type Node = { id: unknown; attrs: Record<string, unknown>; children: ReadonlyArray<Node> };
    const w = window as unknown as { __weaveDoc?: { root: Node } };
    function find(n: Node): Node | undefined {
      if (String(n.id) === targetId) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== undefined) return r;
      }
      return undefined;
    }
    const root = w.__weaveDoc?.root;
    if (root === undefined) return null;
    return find(root)?.attrs ?? null;
  }, id);
}

async function designHeight(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const w = window as unknown as { __weaveDesign?: { height?: number } };
    return w.__weaveDesign?.height ?? 0;
  });
}

async function cameraScale(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const w = window as unknown as { __weaveVm?: { camera: { scale: { get: () => number } } } };
    return w.__weaveVm?.camera.scale.get() ?? -1;
  });
}

async function rootId(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const w = window as unknown as { __weaveDoc?: { root: { id: unknown } } };
    return String(w.__weaveDoc?.root.id ?? "");
  });
}

/** Id of the parent node that directly contains `childId`. */
async function parentIdOf(page: Page, childId: string): Promise<string | null> {
  return await page.evaluate((cid) => {
    type Node = { id: unknown; children: ReadonlyArray<Node> };
    const w = window as unknown as { __weaveDoc?: { root: Node } };
    function walk(n: Node): string | null {
      for (const c of n.children) {
        if (String(c.id) === cid) return String(n.id);
        const r = walk(c);
        if (r !== null) return r;
      }
      return null;
    }
    const root = w.__weaveDoc?.root;
    return root === undefined ? null : walk(root);
  }, childId);
}

async function setCameraScale(page: Page, scale: number): Promise<void> {
  await page.evaluate((s) => {
    const w = window as unknown as {
      __weaveVm?: {
        camera: {
          scale: { set: (v: number) => void };
          tx: { set: (v: number) => void };
          ty: { set: (v: number) => void };
        };
      };
    };
    w.__weaveVm?.camera.tx.set(0);
    w.__weaveVm?.camera.ty.set(0);
    w.__weaveVm?.camera.scale.set(s);
  }, scale);
  await page.waitForTimeout(120);
}

// A pre-existing frame makes `screenToDesign` use its live-rendered rect
// (the exact camera) instead of the empty-design letterbox fallback, so the
// comparisons below all share one consistent scale.
async function seedSampleFrame(page: Page): Promise<void> {
  await addFrame(page, "frame", {
    frame: { x: 0.05, y: 0.05, width: 0.1, height: 0.1, rotation: 0 },
  });
}

test("adding a shape to the root centres it in the viewport", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "VP-Center" });
  await seedSampleFrame(page);

  const id = await addToRoot(page, "KeyR");
  const frame = (await readItemFrame(page, id)) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Centred on the (un-panned) viewport, whose centre is the design centre.
  expect(frame.x + frame.width / 2).toBeCloseTo(0.5, 1);
  expect(frame.y + frame.height / 2).toBeCloseTo(0.5, 1);
  expect(frame.width).toBeGreaterThan(0.2);
  expect(frame.height).toBeGreaterThan(0.2);
});

test("text adds at 30% height with a font that fills it, stored as a ratio", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "VP-Text" });
  await seedSampleFrame(page);
  const dh = await designHeight(page);
  expect(dh).toBeGreaterThan(0);

  const shapeId = await addToRoot(page, "KeyR");
  const shapeFrame = (await readItemFrame(page, shapeId)) as { height: number };

  const textId = await addToRoot(page, "KeyT");
  const textFrame = (await readItemFrame(page, textId)) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Text height is 30% vs the normal 40% of the same viewport → ratio 0.75.
  expect(textFrame.height / shapeFrame.height).toBeCloseTo(0.75, 1);
  expect(textFrame.x + textFrame.width / 2).toBeCloseTo(0.5, 1);
  expect(textFrame.y + textFrame.height / 2).toBeCloseTo(0.5, 1);

  const attrs = (await readAttrs(page, textId)) as {
    fontSize?: number;
    fontSizeRatio?: number;
  };
  // Font stored as a parent-height ratio; the derived px fills the box
  // height for a single line (lineHeight 1.4): fontSize ≈ boxHeightPx / 1.4.
  expect(typeof attrs.fontSizeRatio).toBe("number");
  expect(typeof attrs.fontSize).toBe("number");
  const boxHeightPx = textFrame.height * dh;
  expect(attrs.fontSize as number).toBeCloseTo(boxHeightPx / 1.4, 0);
  expect(attrs.fontSizeRatio as number).toBeCloseTo(textFrame.height / 1.4, 2);
});

test("the placed size tracks the viewport, not the design (zoom independence)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "VP-Zoom" });
  await seedSampleFrame(page);

  const id1 = await addToRoot(page, "KeyR");
  const w1 = ((await readItemFrame(page, id1)) as { width: number }).width;

  // Zoom to 2x (no pan): the viewport now covers half the design per axis,
  // so a fresh add must be ~half the stored width to stay 40% of the
  // *viewport*.
  await setCameraScale(page, 2);
  const id2 = await addToRoot(page, "KeyR");
  const f2 = (await readItemFrame(page, id2)) as {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Half the width (viewport halved), still centred on the design centre.
  expect(f2.width / w1).toBeCloseTo(0.5, 1);
  expect(f2.x + f2.width / 2).toBeCloseTo(0.5, 1);
});

// ── Container routing + zoom-to-frame ─────────────────────────────────

test("adding while a FRAME is selected nests into it and zooms the frame full-screen", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "VP-FrameAdd" });
  await seedSampleFrame(page);

  // Add a frame to the root (auto-selected).
  const frameId = await addToRoot(page, "KeyF");
  const scaleBefore = await cameraScale(page);

  // With that frame still selected, add a shape — it must nest INTO the
  // frame and the camera must zoom so the frame fills the viewport.
  await page.keyboard.press("KeyR");
  await expect.poll(async () => (await selectedId(page)) !== frameId).toBe(true);
  const shapeId = (await selectedId(page)) as string;

  expect(await parentIdOf(page, shapeId)).toBe(frameId);
  await expect.poll(() => cameraScale(page)).toBeGreaterThan(scaleBefore + 0.2);
});

test("adding while a NON-frame item is selected routes to the root", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "VP-ItemAdd" });
  await seedSampleFrame(page);
  const root = await rootId(page);

  // A shape at the root, selected.
  const shapeId = await addToRoot(page, "KeyR");
  expect(await parentIdOf(page, shapeId)).toBe(root);

  // With the shape selected, add another item — it must go to the ROOT, not
  // nest inside the (non-container) shape.
  await page.keyboard.press("KeyR");
  await expect.poll(async () => (await selectedId(page)) !== shapeId).toBe(true);
  const secondId = (await selectedId(page)) as string;
  expect(await parentIdOf(page, secondId)).toBe(root);
});

test("added text uses Fixed resize mode (layoutChild left/top)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "VP-TextFixed" });
  await seedSampleFrame(page);

  const textId = await addToRoot(page, "KeyT");
  const attrs = (await readAttrs(page, textId)) as {
    layoutChild?: { kind?: string; anchor?: { horizontal?: string; vertical?: string } };
  };
  expect(attrs.layoutChild?.kind).toBe("absolute-constraints");
  expect(attrs.layoutChild?.anchor?.horizontal).toBe("left");
  expect(attrs.layoutChild?.anchor?.vertical).toBe("top");
});
