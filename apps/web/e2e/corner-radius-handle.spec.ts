// WI-109 — on-canvas corner-radius handle (live runtime proof).
//
// Uniform top-right grip drags to round all corners; double-click splits into
// four per-corner grips; dragging one moves only that corner; double-clicking a
// per-corner grip MERGES every corner to that grip's value and returns to the
// single top-right grip.

import { expect, type Page, test } from "@playwright/test";
import { nn } from "../src/lib/nn.js";
import { addFrame, clearAllDesigns, prepareDesign, setSelection } from "./helpers";

interface Attrs {
  readonly cornerRadius?: number;
  readonly cornerRadii?: { tl: number; tr: number; br: number; bl: number };
}

async function readAttrs(page: Page, itemId: string): Promise<Attrs> {
  return page.evaluate((id) => {
    interface Node {
      readonly id: string | number;
      readonly attrs: Record<string, unknown>;
      readonly children: ReadonlyArray<Node>;
    }
    const doc = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc;
    const find = (n: Node): Node | null => {
      if (String(n.id) === id) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== null) return r;
      }
      return null;
    };
    const node = doc ? find(doc.root) : null;
    return (node?.attrs ?? {}) as Attrs;
  }, itemId);
}

async function lastChildId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const root = (window as unknown as { __weaveDoc: { root: { children: { id: unknown }[] } } })
      .__weaveDoc.root;
    return String(nn(root.children[root.children.length - 1]).id);
  });
}

/** Drag a grip by a screen delta (toward the box center rounds the corner). */
async function dragGrip(page: Page, testId: string, dx: number, dy: number): Promise<void> {
  const grip = page.getByTestId(testId);
  const box = await grip.boundingBox();
  if (box === null) throw new Error(`grip ${testId} has no box`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
  await page.mouse.up();
}

test.describe("corner-radius handle", () => {
  test.beforeEach(async ({ page }) => {
    await clearAllDesigns(page);
  });

  test("drag rounds uniformly; double-click splits, merges back to the clicked value", async ({
    page,
  }) => {
    await prepareDesign(page);
    await addFrame(page, "frame", {
      frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
    });
    const id = await lastChildId(page);
    await setSelection(page, [id]);

    // Uniform mode → ONLY the top-right grip.
    await expect(page.getByTestId("corner-radius-handle-tr")).toBeVisible();
    await expect(page.getByTestId("corner-radius-handle-tl")).toHaveCount(0);
    await expect(page.getByTestId("corner-radius-handle-bl")).toHaveCount(0);

    // Drag the top-right grip inward (toward center = left+down) → rounds all.
    await dragGrip(page, "corner-radius-handle-tr", -60, 60);
    await expect.poll(async () => (await readAttrs(page, id)).cornerRadius ?? 0).toBeGreaterThan(5);
    // Still uniform (no per-corner tuple yet).
    expect((await readAttrs(page, id)).cornerRadii).toBeUndefined();

    // Double-click the grip → SPLIT into four grips.
    await page.getByTestId("corner-radius-handle-tr").dblclick();
    await expect(page.getByTestId("corner-radius-handle-tl")).toBeVisible();
    await expect(page.getByTestId("corner-radius-handle-br")).toBeVisible();
    await expect(page.getByTestId("corner-radius-handle-bl")).toBeVisible();
    // Split seeds the four-tuple from the uniform value.
    await expect.poll(async () => (await readAttrs(page, id)).cornerRadii !== undefined).toBe(true);

    // Drag ONLY the top-left grip (inward = right+down) → tl diverges.
    await dragGrip(page, "corner-radius-handle-tl", 40, 40);
    const split = await readAttrs(page, id);
    expect(split.cornerRadii).toBeDefined();
    expect(nn(split.cornerRadii).tl).toBeGreaterThan(5);
    expect(Math.abs(nn(split.cornerRadii).tl - nn(split.cornerRadii).tr)).toBeGreaterThan(1);

    // Double-click the top-left grip → MERGE: every corner = tl's value, back to
    // a single top-right grip (uniform).
    const tlValue = nn((await readAttrs(page, id)).cornerRadii).tl;
    await page.getByTestId("corner-radius-handle-tl").dblclick();
    await expect(page.getByTestId("corner-radius-handle-bl")).toHaveCount(0);
    await expect(page.getByTestId("corner-radius-handle-tr")).toBeVisible();
    await expect
      .poll(async () => {
        const a = await readAttrs(page, id);
        return a.cornerRadii === undefined && Math.abs((a.cornerRadius ?? 0) - tlValue) < 1.5;
      })
      .toBe(true);
  });
});
