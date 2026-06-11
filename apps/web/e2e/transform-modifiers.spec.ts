// WI-183 — transform modifiers (SLIDE_DECK_INTERACTION_SPEC §4 Batch 1).
//
//   • Shift+drag → axis lock: the minor axis of the move is zeroed before
//     the snap engine sees it (move-modifiers.ts decorator on the
//     FrameMoveSnap chain).
//   • Enter with one TEXT item selected → enter text edit mode (the
//     textEditTrigger registry — Rule 6, no kind compare; DesignPage's
//     window keydown handler consumes the key only when a surface
//     registered itself).
//
// Alt+drag duplicate is covered in frame-in-frame-add.spec.ts (alongside
// the WI-034 supersession it interacts with). Shift/Alt RESIZE geometry is
// unit-covered in resize-geometry.test.ts (pure helper).

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

interface RatioFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function lastRootChildId(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  expect(id.length).toBeGreaterThan(0);
  return id;
}

async function ratioFrameOf(page: Page, id: string): Promise<RatioFrame> {
  const f = await page.evaluate((tid) => {
    type Node = {
      id: unknown;
      attrs: { frame?: { x: number; y: number; width: number; height: number } };
      children: ReadonlyArray<Node>;
    };
    const w = window as unknown as { __weaveDoc?: { root: Node } };
    function find(n: Node): Node | undefined {
      if (String(n.id) === tid) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== undefined) return r;
      }
      return undefined;
    }
    const root = w.__weaveDoc?.root;
    if (root === undefined) return null;
    const fr = find(root)?.attrs.frame;
    return fr === undefined ? null : { x: fr.x, y: fr.y, width: fr.width, height: fr.height };
  }, id);
  expect(f).not.toBeNull();
  return f as RatioFrame;
}

test("Shift+drag locks the move to the dominant axis", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-183-axis-lock" });
  // Far from the mixed-flavor starter content so alignment guides have
  // nothing to snap the locked axis to.
  await addFrame(page, "frame", {
    frame: { x: 0.7, y: 0.7, width: 0.15, height: 0.15, rotation: 0 },
  });
  const id = await lastRootChildId(page);
  const before = await ratioFrameOf(page, id);

  const el = page.locator(`[data-testid="block-frame"][data-frame-id="${id}"]`);
  const box = await el.boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  // x-dominant diagonal drag with Shift held: +120 / +30 viewport px.
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

  const after = await ratioFrameOf(page, id);
  expect(after.x).toBeGreaterThan(before.x + 0.02); // moved on the dominant axis
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.005); // minor axis locked
});

test("Enter with a single text item selected enters edit mode; non-text selection falls through", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-183-enter-edit" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-text").click();

  // Select the text item with a plain canvas click (also moves focus off
  // the toolbar button so Enter can't re-trigger it).
  await page.getByTestId("text-block").last().click();

  await page.keyboard.press("Enter");
  const editor = page.getByRole("textbox", { name: "Text content" });
  await editor.waitFor({ timeout: 5_000 });

  // Leave edit mode — Esc returns to item selection.
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);

  // Non-text selection: Enter keeps the WI-033 A3 drill-down semantics
  // (no text editor appears). Frame with a child: Enter selects the child.
  await addFrame(page, "frame", {
    frame: { x: 0.7, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  const frameId = await lastRootChildId(page);
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (id: string) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, frameId);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Text content" })).toHaveCount(0);
});
