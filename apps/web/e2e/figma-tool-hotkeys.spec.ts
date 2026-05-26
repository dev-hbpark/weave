// WI-035 P1 — Tool hotkey (R / T / L / F).
//
// Single press inserts a default-sized item of the requested kind into
// the currently selected frame (or root when nothing is selected).
// Text-edit mode disables the hotkey via `commandContext.isTextEditing`
// (same guard as A3 keyboard nav).

import { expect, test, type Page } from "@playwright/test";
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

async function preselect(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
}

async function setupParent(page: Page): Promise<string> {
  await prepareDesign(page, { flavor: "mixed", title: "WI-035-tools" });
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
  return parentId;
}

test("R hotkey adds a shape (rectangle) to the selected frame", async ({ page }) => {
  const parentId = await setupParent(page);
  await preselect(page, parentId);
  const before = await childCountOf(page, parentId);
  await page.keyboard.press("KeyR");
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});

test("T hotkey adds a text item to the selected frame", async ({ page }) => {
  const parentId = await setupParent(page);
  await preselect(page, parentId);
  const before = await childCountOf(page, parentId);
  await page.keyboard.press("KeyT");
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});

test.skip("L hotkey adds a shape (line) to the selected frame", async ({ page }) => {
  // WI-035 bug fix — L binding removed (user-reported conflict with a
  // layer-move affordance). Skip until a non-conflicting binding is
  // re-assigned in a follow-up. The command (tool.addLine) is still
  // registered and dispatchable via palette / Toolbar add menu.
  const parentId = await setupParent(page);
  await preselect(page, parentId);
  const before = await childCountOf(page, parentId);
  await page.keyboard.press("KeyL");
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});

test("F hotkey adds a frame to the selected frame", async ({ page }) => {
  const parentId = await setupParent(page);
  await preselect(page, parentId);
  const before = await childCountOf(page, parentId);
  await page.keyboard.press("KeyF");
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});

test("R hotkey fires even when IME is composing (Korean input mode)", async ({ page }) => {
  // WI-035 IME-safety regression. With Korean IME on, browsers fire
  // keydown with `key="Process"` + `isComposing=true` while a
  // composition is pending. The agocraft hotkey registry (which
  // matches by `event.key`) misses; our sidecar matches by
  // `event.code` instead. Simulate by dispatching a synthetic
  // keydown carrying both the composition flag and the physical code.
  const parentId = await setupParent(page);
  await preselect(page, parentId);
  const before = await childCountOf(page, parentId);
  await page.evaluate(() => {
    const ev = new KeyboardEvent("keydown", {
      key: "Process",
      code: "KeyR",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    window.dispatchEvent(ev);
  });
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});

test("R hotkey with no selection adds to root.children", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-035-root" });
  // No preselect — root.children is empty (0 frames).
  const before = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<unknown> } };
    };
    return w.__weaveDoc?.root.children?.length ?? 0;
  });
  await page.keyboard.press("KeyR");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window as unknown as {
          __weaveDoc?: { root: { children: ReadonlyArray<unknown> } };
        };
        return w.__weaveDoc?.root.children?.length ?? 0;
      }),
    )
    .toBe(before + 1);
});
