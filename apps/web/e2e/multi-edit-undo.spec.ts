// A property change applied across a multi-selection must collapse into ONE
// undo step. The ContextualToolbar applies per-item edits via `updateAll`,
// which loops `weave.item.update` per id; each item carries a distinct
// per-item mergeKey (`item.attrs#<id>`) so the editor's mergeKey coalescing
// never merges across items. Without `runBatch` grouping, a single multi-
// selection change produced N undo entries (one Cmd+Z reverted only one
// item). `batchPerItem` wraps the loop in `editor.runBatch` so it is one step.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

/** Select every id. The shared `setSelection` helper has no working multi
 *  path (the editor's Selection API exposes `add`, not `addMany`), so select
 *  here with `set` for the first id then `add` for the rest. */
async function selectAll(page: Page, ids: string[]): Promise<void> {
  await page.evaluate((targets) => {
    type Sel = { set: (x: unknown) => void; add: (x: unknown) => void; clear: () => void };
    const vm = (window as unknown as { __weaveVm?: { itemSelection: Sel } }).__weaveVm;
    if (vm === undefined || targets.length === 0) return;
    vm.itemSelection.clear();
    vm.itemSelection.set(targets[0]);
    for (let i = 1; i < targets.length; i++) vm.itemSelection.add(targets[i]);
  }, ids);
}

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function frameIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string }> } };
    };
    return (w.__weaveDoc?.root.children ?? [])
      .filter((c) => c.kind === "frame")
      .map((c) => String(c.id));
  });
}

/** Per-id `attrs.background` (string or undefined). */
async function backgrounds(page: Page, ids: string[]): Promise<Array<string | undefined>> {
  return page.evaluate((targetIds) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: { children: ReadonlyArray<{ id: unknown; attrs: Record<string, unknown> }> };
      };
    };
    const map = new Map<string, unknown>();
    for (const c of w.__weaveDoc?.root.children ?? []) {
      map.set(String(c.id), (c.attrs as { background?: unknown }).background);
    }
    return targetIds.map((id) => {
      const v = map.get(id);
      return typeof v === "string" ? v : undefined;
    });
  }, ids);
}

async function setBackground(page: Page, id: string, color: string): Promise<void> {
  await page.evaluate(
    ({ id, color }) => {
      type Editor = { exec: (name: string, input: unknown) => unknown };
      const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
      ed?.exec("weave.item.update", {
        itemId: id,
        patch: (prev: { attrs: Record<string, unknown> }) => ({
          attrs: { ...prev.attrs, background: color },
        }),
      });
    },
    { id, color },
  );
}

test("multi-selection property change reverts in a single undo", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Multi-undo" });
  await addFrame(page, "slide", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "slide", {
    frame: { x: 0.6, y: 0.6, width: 0.3, height: 0.3, rotation: 0 },
  });
  const ids = await frameIds(page);
  expect(ids.length).toBe(2);

  // Setup: give both frames the same background so the toolbar's "clear bg"
  // control (which dispatches through `updateAll`) appears for the multi-
  // selection. These two execs are just setup (2 separate undo entries).
  await setBackground(page, ids[0] as string, "#112233");
  await setBackground(page, ids[1] as string, "#112233");
  expect(await backgrounds(page, ids)).toEqual(["#112233", "#112233"]);

  await selectAll(page, ids);
  await expect(page.getByTestId("contextual-toolbar")).toHaveAttribute("data-multi", "true");

  // Clear background on BOTH frames in one toolbar action.
  await page.getByTestId("frame-bg-clear").click();
  await expect.poll(() => backgrounds(page, ids)).toEqual([undefined, undefined]);

  // ONE Cmd+Z must restore BOTH backgrounds. Pre-fix this was N entries, so a
  // single undo restored only one frame's background.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => backgrounds(page, ids)).toEqual(["#112233", "#112233"]);
});
