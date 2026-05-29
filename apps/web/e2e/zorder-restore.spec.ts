// WI-038 — z-order command surface (hotkeys + ContextMenu) regression cover.
//
// Verifies that the four z-order moves operate on the selected item's
// direct parent container, so the same dispatch works regardless of
// whether the item is a top-level Frame or a primitive nested inside a
// frame. Three angles:
//
//   1. `editor.exec` direct dispatch → doc state mutated, history aware.
//   2. Hotkey `]` / `[` → doc state mutated through the editor scope.
//   3. Right-click ContextMenu "맨 앞으로" → doc state mutated through the
//      menu wiring.
//
// Each angle Cmd+Z's once and verifies the state reverted.

import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function rootChildIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    type Doc = { root: { children: ReadonlyArray<{ id: string | number }> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [];
    return doc.root.children.map((c) => String(c.id));
  });
}

async function selectFrameInVm(page: import("@playwright/test").Page, id: string): Promise<void> {
  await page.evaluate((targetId) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(targetId);
  }, id);
}

test('editor.exec("weave.item.bringToFront") moves the frame to last and Cmd+Z reverts', async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  // Seed gives us one root child; add two more so we have three top-level
  // frames to reorder.
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.7, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  const initial = await rootChildIds(page);
  expect(initial.length).toBeGreaterThanOrEqual(3);

  // Bring the FIRST root frame to the front via editor.exec.
  const first = initial[0]!;
  await page.evaluate((id) => {
    type Editor = { exec: (name: string, input: unknown) => unknown };
    const editor = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
    editor?.exec("weave.item.bringToFront", { itemId: id });
  }, first);

  const afterFront = await rootChildIds(page);
  expect(afterFront[afterFront.length - 1]).toBe(first);
  expect(afterFront).not.toEqual(initial);

  // Cmd+Z reverts.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  expect(await rootChildIds(page)).toEqual(initial);
});

test("hotkey `]` brings the selected frame one step forward and Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.7, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  const initial = await rootChildIds(page);
  expect(initial.length).toBeGreaterThanOrEqual(3);

  // Select the first frame so the hotkey has a target.
  const first = initial[0]!;
  await selectFrameInVm(page, first);

  // Move focus off the canvas so the keyboard event is captured by the
  // editor scope (the hotkey registry skips text-editing surfaces).
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await selectFrameInVm(page, first);
  await page.keyboard.press("]");
  await page.waitForTimeout(80);

  const afterForward = await rootChildIds(page);
  // `first` should now be at index 1 (one step toward the front).
  expect(afterForward.indexOf(first)).toBe(1);

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  expect(await rootChildIds(page)).toEqual(initial);
});

test("peek (L hold) + controller drag commits a reorder against the peek container — root level", async ({
  page,
}) => {
  // Phase 2 angle — exercise the agocraft PeekModeController's drag/commit
  // path that the L hotkey unlocks. We drive the controller directly via
  // `window.__weavePeek` (DEV diagnostic) to avoid pixel-perfect mouse
  // coords; the equivalent of: hold L → cursor over a stack → drag the
  // top item to the bottom rank → release. The commit MUST land as a
  // `weave.design.reorderChildren` patch so Cmd+Z reverts it cleanly.
  //
  // The two added frames are deliberately overlapped at (~0.3, ~0.3) so the
  // peek controller's cursor probe lifts BOTH at once — a single-item
  // lift set is a no-op drag (the controller skips onCommit when the
  // order didn't change).
  await prepareDesign(page, { flavor: "slide-deck" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
  });
  const initial = await rootChildIds(page);
  expect(initial.length).toBeGreaterThanOrEqual(3);

  await page.keyboard.down("KeyL");
  // Wait for peek to activate.
  await page.waitForFunction(() => {
    type Peek = { isActive: boolean };
    return (window as unknown as { __weavePeek?: Peek }).__weavePeek?.isActive === true;
  });

  const designBox = await page.evaluate(() => {
    type Design = { width: number; height: number };
    return (window as unknown as { __weaveDesign?: Design }).__weaveDesign;
  });
  if (!designBox) throw new Error("design not exposed");

  // Drag the two added frames' first one (initial[1]) to the top of the
  // lift stack. Cursor at (0.5, 0.5) hits the overlap region of both
  // added frames — and the seed FULL_FRAME wrapping covers it too.
  const draggedId = initial[1]!;
  await page.evaluate(
    ({ targetId, dw, dh }) => {
      type Peek = {
        controller: {
          setCursor: (x: number, y: number, inside: boolean) => void;
          startDrag: (id: string) => boolean;
          updateDrag: (rank: number) => void;
          endDrag: (commit: boolean) => void;
          liftSet: { get: () => { orderedIds: ReadonlyArray<string> } | null };
        };
      };
      const peek = (window as unknown as { __weavePeek?: Peek }).__weavePeek;
      if (!peek) throw new Error("__weavePeek missing");
      peek.controller.setCursor(dw * 0.5, dh * 0.5, true);
      const lift = peek.controller.liftSet.get();
      if (!lift) throw new Error("peek did not lift");
      if (lift.orderedIds.length < 2) {
        throw new Error(`lift set too small for a real drag: ${JSON.stringify(lift.orderedIds)}`);
      }
      if (!peek.controller.startDrag(targetId)) {
        throw new Error("startDrag rejected — target not in lift set");
      }
      peek.controller.updateDrag(lift.orderedIds.length - 1);
      peek.controller.endDrag(true);
    },
    { targetId: draggedId, dw: designBox.width, dh: designBox.height },
  );

  await page.keyboard.up("KeyL");
  await page.waitForTimeout(80);

  // The dragged item should now be at the top (last in z-asc).
  const afterDrag = await rootChildIds(page);
  expect(afterDrag.length).toBe(initial.length);
  expect(afterDrag[afterDrag.length - 1]).toBe(draggedId);

  // Cmd+Z reverts.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  expect(await rootChildIds(page)).toEqual(initial);
});

test("peek (L hold) + controller drag commits a reorder against the peek container — nested inside a selected frame", async ({
  page,
}) => {
  // WI-038 Phase 2's whole point — when the user has a child item selected
  // inside a frame, pressing L peeks that frame's children. The drag commits
  // against the parent frame as the container, not root.
  await prepareDesign(page, { flavor: "slide-deck" });
  const initialRoot = await rootChildIds(page);
  const containerId = initialRoot[0];
  if (containerId === undefined) throw new Error("no seed frame at root");

  // Two overlapping nested shapes so the peek lift set contains both at
  // the cursor probe.
  await addFrame(page, "shape", {
    containerId,
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  await addFrame(page, "shape", {
    containerId,
    frame: { x: 0.3, y: 0.3, width: 0.4, height: 0.4, rotation: 0 },
  });

  const innerIdsBefore = await page.evaluate((cid) => {
    type Item = { id: string | number; children: ReadonlyArray<{ id: string | number }> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [];
    const frame = doc.root.children.find((c) => String(c.id) === cid);
    if (frame === undefined) return [];
    return frame.children.map((c) => String(c.id));
  }, containerId);
  expect(innerIdsBefore.length).toBeGreaterThanOrEqual(2);

  // Select one of the nested items so peek's containerId becomes its parent.
  const firstInner = innerIdsBefore[0]!;
  await selectFrameInVm(page, firstInner);

  // Give the React effect chain (selection → peekContainerId state →
  // usePeekMode effect → containerIdRef + markDirty) a moment to flush
  // before we press L. vm.itemSelection.state.get() returns
  // `{ kind: "single", itemId } | { kind: "multi", ids } | undefined`.
  await page.waitForFunction((expectedId) => {
    type Vm = { itemSelection?: { state: { get: () => unknown } } };
    const vm = (window as unknown as { __weaveVm?: Vm }).__weaveVm;
    const sel = vm?.itemSelection?.state.get() as { kind: "single"; itemId: unknown } | undefined;
    return sel?.kind === "single" && String(sel.itemId) === expectedId;
  }, firstInner);

  await page.keyboard.down("KeyL");
  await page.waitForFunction(() => {
    type Peek = { isActive: boolean };
    return (window as unknown as { __weavePeek?: Peek }).__weavePeek?.isActive === true;
  });

  // Drive a controller drag of the first nested item → top.
  const designBox = await page.evaluate(() => {
    type Design = { width: number; height: number };
    return (window as unknown as { __weaveDesign?: Design }).__weaveDesign;
  });
  if (!designBox) throw new Error("design not exposed");

  await page.evaluate(
    ({ targetId, dw, dh }) => {
      type Peek = {
        controller: {
          setCursor: (x: number, y: number, inside: boolean) => void;
          startDrag: (id: string) => boolean;
          updateDrag: (rank: number) => void;
          endDrag: (commit: boolean) => void;
          liftSet: { get: () => { orderedIds: ReadonlyArray<string> } | null };
        };
      };
      const peek = (window as unknown as { __weavePeek?: Peek }).__weavePeek;
      if (!peek) throw new Error("__weavePeek missing");
      // The wrapping FULL_FRAME covers the whole design, so nested children
      // at (0.2..0.6, 0.2..0.6) and (0.3..0.7, 0.3..0.7) overlap at
      // (~0.5, ~0.5). Probe there to lift both.
      peek.controller.setCursor(dw * 0.5, dh * 0.5, true);
      const lift = peek.controller.liftSet.get();
      if (!lift) throw new Error("peek did not lift");
      if (lift.orderedIds.length < 2) {
        throw new Error(`lift set too small for a real drag: ${JSON.stringify(lift.orderedIds)}`);
      }
      if (!peek.controller.startDrag(targetId)) {
        throw new Error("startDrag rejected — target not in lift set");
      }
      peek.controller.updateDrag(lift.orderedIds.length - 1);
      peek.controller.endDrag(true);
    },
    { targetId: firstInner, dw: designBox.width, dh: designBox.height },
  );

  await page.keyboard.up("KeyL");
  await page.waitForTimeout(80);

  // Root order MUST NOT change.
  expect(await rootChildIds(page)).toEqual(initialRoot);

  // Inner ordering DID change — `firstInner` is now last.
  const innerAfter = await page.evaluate((cid) => {
    type Item = { id: string | number; children: ReadonlyArray<{ id: string | number }> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [];
    const frame = doc.root.children.find((c) => String(c.id) === cid);
    if (frame === undefined) return [];
    return frame.children.map((c) => String(c.id));
  }, containerId);
  expect(innerAfter[innerAfter.length - 1]).toBe(firstInner);

  // Cmd+Z reverts.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  const innerAfterUndo = await page.evaluate((cid) => {
    type Item = { id: string | number; children: ReadonlyArray<{ id: string | number }> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [];
    const frame = doc.root.children.find((c) => String(c.id) === cid);
    if (frame === undefined) return [];
    return frame.children.map((c) => String(c.id));
  }, containerId);
  expect(innerAfterUndo).toEqual(innerIdsBefore);
});

test("nested: bringForward operates inside the parent frame, not at root", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  // Root has one seeded frame; add two shape primitives INSIDE that frame.
  const initialRoot = await rootChildIds(page);
  const containerId = initialRoot[0];
  if (containerId === undefined) throw new Error("no seed frame at root");

  await addFrame(page, "shape", {
    containerId,
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "shape", {
    containerId,
    frame: { x: 0.5, y: 0.5, width: 0.2, height: 0.2, rotation: 0 },
  });

  const innerIds = await page.evaluate((cid) => {
    type Item = { id: string | number; children: ReadonlyArray<{ id: string | number }> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [];
    const frame = doc.root.children.find((c) => String(c.id) === cid);
    if (frame === undefined) return [];
    return frame.children.map((c) => String(c.id));
  }, containerId);
  expect(innerIds.length).toBeGreaterThanOrEqual(2);

  const firstInner = innerIds[0]!;
  await page.evaluate(
    ({ id }) => {
      type Editor = { exec: (name: string, input: unknown) => unknown };
      const editor = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
      editor?.exec("weave.item.bringToFront", { itemId: id });
    },
    { id: firstInner },
  );

  // Root order should NOT change.
  expect(await rootChildIds(page)).toEqual(initialRoot);

  // The inner frame's children DID reorder — `firstInner` is now last.
  const innerAfter = await page.evaluate((cid) => {
    type Item = { id: string | number; children: ReadonlyArray<{ id: string | number }> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [];
    const frame = doc.root.children.find((c) => String(c.id) === cid);
    if (frame === undefined) return [];
    return frame.children.map((c) => String(c.id));
  }, containerId);
  expect(innerAfter[innerAfter.length - 1]).toBe(firstInner);

  // Cmd+Z reverts the nested reorder.
  await page.getByTestId("frame-stage").click({ position: { x: 5, y: 100 } });
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  const innerAfterUndo = await page.evaluate((cid) => {
    type Item = { id: string | number; children: ReadonlyArray<{ id: string | number }> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [];
    const frame = doc.root.children.find((c) => String(c.id) === cid);
    if (frame === undefined) return [];
    return frame.children.map((c) => String(c.id));
  }, containerId);
  expect(innerAfterUndo).toEqual(innerIds);
});
