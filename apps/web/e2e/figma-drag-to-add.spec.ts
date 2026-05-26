// WI-035 P3 — Toolbar drag-to-add tile.
//
// Dragging an add-tile (DropdownMenu add item) sets the dataTransfer
// mime `application/x-weave-add-kind`; dropping on a frame routes the
// drop's containerId through FrameStage's onDropAdd and dispatches the
// same `weave.item.add` SSOT used by the hotkey + QuickActionBar paths.
//
// The contract is the mime, not the menu UI. The test dispatches
// synthetic dragover + drop events with the mime payload on the target
// frame element — equivalent to a real drag from any tile that sets
// the mime on dragstart.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function childCountOf(page: Page, parentId: string): Promise<number> {
  return await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            children: ReadonlyArray<{ id: unknown }>;
          }>;
        };
      };
    };
    const parent = w.__weaveDoc?.root.children?.find((c) => String(c.id) === pid);
    return parent?.children?.length ?? 0;
  }, parentId);
}

test("drop with mime 'application/x-weave-add-kind=text' on a frame → text item added as that frame's child", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-035-P3" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  const before = await childCountOf(page, parentId);

  // Dispatch synthetic dragover + drop with the add-kind mime on the
  // target frame element. FrameStage's `onDrop={onDropAdd(e, itemId)}`
  // routes the drop's containerId; DesignPage's handler reads the mime
  // and dispatches `weave.item.add`.
  await page.evaluate((pid) => {
    const el = document.querySelector(`[data-frame-id="${pid}"]`) as HTMLElement | null;
    if (el === null) throw new Error("frame element not found");
    const r = el.getBoundingClientRect();
    const dt = new DataTransfer();
    dt.setData("application/x-weave-add-kind", "text");
    const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, ...at }),
    );
    el.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, ...at }),
    );
  }, parentId);

  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});

test("drop with mime 'application/x-weave-add-kind=shape' on a frame → shape item added as that frame's child", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-035-P3-shape" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  const before = await childCountOf(page, parentId);

  await page.evaluate((pid) => {
    const el = document.querySelector(`[data-frame-id="${pid}"]`) as HTMLElement | null;
    if (el === null) throw new Error("frame element not found");
    const r = el.getBoundingClientRect();
    const dt = new DataTransfer();
    dt.setData("application/x-weave-add-kind", "shape");
    const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, ...at }),
    );
    el.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, ...at }),
    );
  }, parentId);

  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});
