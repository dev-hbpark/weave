// WI-036 follow-up — QuickActionBar pivoted from hover-driven to
// SELECTION-driven. The bar mounts when a frame is selected, stays
// fixed-positioned above the frame, and is unaffected by where the
// mouse goes next. The `+` button still hover-opens a submenu of add
// options; clicking an option only closes the submenu, leaving the
// bar visible for further actions.

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

async function selectFrame(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
  // React state propagates via vm.itemSelection signal → useSelection
  // hook → re-render. Give it one frame so the next assertion doesn't
  // race the bar's mount.
  await page.waitForTimeout(50);
}

async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(undefined);
  });
}

async function selectFrames(page: Page, ids: ReadonlyArray<string>): Promise<void> {
  await page.evaluate(
    (arr) => {
      const w = window as unknown as {
        __weaveVm?: { itemSelection: { setMany: (ids: Iterable<string>) => void } };
      };
      w.__weaveVm?.itemSelection.setMany(arr);
    },
    [...ids],
  );
  await page.waitForTimeout(50);
}

test("WI-036 — selecting a frame surfaces the bar; clicking + adds a child frame", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-select" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.4, width: 0.4, height: 0.3, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });

  // Before selection — no bar.
  await expect(page.getByTestId("cmd-frame-addChild")).toHaveCount(0);

  await selectFrame(page, parentId);
  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });

  const before = await childCountOf(page, parentId);
  await addBtn.click();
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
});

test("WI-036 — bar persists when the mouse leaves the frame (selection-driven, hover-agnostic)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-leave" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.4, width: 0.4, height: 0.3, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  await selectFrame(page, parentId);
  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });

  // Move the mouse far away — bar stays because selection stays.
  await page.mouse.move(8, 8);
  await page.waitForTimeout(400);
  await expect(addBtn).toBeVisible();
});

test("WI-036 — clearing selection unmounts the bar", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-clear" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.4, width: 0.4, height: 0.3, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  await selectFrame(page, parentId);
  await expect(page.getByTestId("cmd-frame-addChild")).toBeVisible({ timeout: 3_000 });

  await clearSelection(page);
  await expect(page.getByTestId("cmd-frame-addChild")).toHaveCount(0, { timeout: 1_000 });
});

test("WI-036 — `+` button hover opens submenu; clicking 'text' inserts a text child and closes the submenu only (bar stays)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-submenu" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.4, width: 0.4, height: 0.3, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  await selectFrame(page, parentId);
  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });

  await addBtn.hover();
  const submenu = page.getByTestId("frame-add-submenu");
  await expect(submenu).toBeVisible({ timeout: 2_000 });

  const before = await childCountOf(page, parentId);
  await page.getByTestId("frame-add-text").click();
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
  // Submenu closes; bar stays (selection didn't change).
  await expect(submenu).toHaveCount(0, { timeout: 1_000 });
  await expect(addBtn).toBeVisible();

  const kinds = await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            children: ReadonlyArray<{ kind: string }>;
          }>;
        };
      };
    };
    const parent = w.__weaveDoc?.root.children?.find((c) => String(c.id) === pid);
    return (parent?.children ?? []).map((c) => c.kind);
  }, parentId);
  expect(kinds).toContain("text");
});

// WI-044 — read the last child's kind + relevant attrs (layout spec for
// frames, shape sub-kind for shapes) so the nested-add tests can assert
// the second-depth type variant actually landed on the new item.
async function lastChildOf(
  page: Page,
  parentId: string,
): Promise<{ kind: string; layoutKind?: string; shape?: string } | null> {
  return page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            children: ReadonlyArray<{
              kind: string;
              attrs?: { layout?: { kind?: string }; shape?: string };
            }>;
          }>;
        };
      };
    };
    const parent = w.__weaveDoc?.root.children?.find((c) => String(c.id) === pid);
    const last = parent?.children?.at(-1);
    if (last === undefined) return null;
    return {
      kind: last.kind,
      layoutKind: last.attrs?.layout?.kind,
      shape: last.attrs?.shape,
    };
  }, parentId);
}

async function openAddMenuFor(page: Page, parentId: string): Promise<void> {
  await selectFrame(page, parentId);
  const addBtn = page.getByTestId("cmd-frame-addChild");
  await expect(addBtn).toBeVisible({ timeout: 3_000 });
  await addBtn.hover();
  await expect(page.getByTestId("frame-add-submenu")).toBeVisible({ timeout: 2_000 });
}

test("WI-044 — frame flyout: hovering 프레임 reveals layout variants; picking Flex creates a frame with an auto-flex layout", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-044-frame-flex" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.3, width: 0.5, height: 0.4, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });

  await openAddMenuFor(page, parentId);

  // Second depth — hovering the frame row opens its layout-paradigm flyout.
  await page.getByTestId("frame-add-frame").hover();
  await expect(page.getByTestId("frame-add-frame-flex")).toBeVisible({ timeout: 2_000 });

  const before = await childCountOf(page, parentId);
  await page.getByTestId("frame-add-frame-flex").click();
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);

  // The new child is a frame carrying an auto-flex layout spec — proving
  // the follow-up `weave.frame.setLayout` was wired, not just the add.
  await expect.poll(async () => (await lastChildOf(page, parentId))?.layoutKind).toBe("auto-flex");
  expect((await lastChildOf(page, parentId))?.kind).toBe("frame");
});

test("WI-044 — frame flyout: picking Grid creates a frame with an auto-grid layout", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-044-frame-grid" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.3, width: 0.5, height: 0.4, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });

  await openAddMenuFor(page, parentId);
  await page.getByTestId("frame-add-frame").hover();
  await expect(page.getByTestId("frame-add-frame-grid")).toBeVisible({ timeout: 2_000 });

  const before = await childCountOf(page, parentId);
  await page.getByTestId("frame-add-frame-grid").click();
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);
  await expect.poll(async () => (await lastChildOf(page, parentId))?.layoutKind).toBe("auto-grid");
});

test("WI-044 — shape flyout: hovering 도형 reveals shape variants; picking 원 creates an ellipse shape", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-044-shape-ellipse" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.3, width: 0.5, height: 0.4, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });

  await openAddMenuFor(page, parentId);
  await page.getByTestId("frame-add-shape").hover();
  await expect(page.getByTestId("frame-add-shape-ellipse")).toBeVisible({ timeout: 2_000 });

  const before = await childCountOf(page, parentId);
  await page.getByTestId("frame-add-shape-ellipse").click();
  await expect.poll(() => childCountOf(page, parentId)).toBe(before + 1);

  const last = await lastChildOf(page, parentId);
  expect(last?.kind).toBe("shape");
  expect(last?.shape).toBe("ellipse");
});

test("WI-044 — image first-depth opens the media picker dialog (no direct insert)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-044-image-dialog" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.3, width: 0.5, height: 0.4, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });

  await openAddMenuFor(page, parentId);

  const before = await childCountOf(page, parentId);
  await page.getByTestId("frame-add-image").click();
  // The media picker opens; nothing is inserted until the user supplies a src.
  await expect(page.getByTestId("media-src-dialog")).toBeVisible({ timeout: 2_000 });
  expect(await childCountOf(page, parentId)).toBe(before);
});

test("WI-036 — multi-selection surfaces the `multi.delete` command and clearing the selection removes the bar", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-multi" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0 },
  });
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });
  expect(ids.length).toBe(2);

  await selectFrames(page, ids);
  // Multi-mode surfaces the `multi.delete` command (✕).
  await expect(page.getByTestId("cmd-multi-delete")).toBeVisible({ timeout: 3_000 });
  // The single-frame `frame.addChild` is hidden (selectedKind === "multi").
  await expect(page.getByTestId("cmd-frame-addChild")).toHaveCount(0);

  // Click ✕ — every selected item is removed.
  await page.getByTestId("cmd-multi-delete").click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window as unknown as {
          __weaveDoc?: { root: { children: ReadonlyArray<unknown> } };
        };
        return w.__weaveDoc?.root.children?.length ?? 0;
      }),
    )
    .toBe(0);
  // Bar disappears.
  await expect(page.getByTestId("cmd-multi-delete")).toHaveCount(0);
});

test("WI-036 — clicking a multi-selection corner handle does NOT clear the selection (pointerdown is swallowed)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-corner-swallow" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0 },
  });
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });
  await selectFrames(page, ids);
  const corner = page.locator("[data-multi-corner='nw']");
  await expect(corner).toBeVisible({ timeout: 3_000 });
  // Press the corner — must NOT clear the multi-selection.
  await corner.dispatchEvent("pointerdown", { bubbles: true });
  await page.waitForTimeout(50);
  await expect(page.getByTestId("multi-selection-overlay")).toBeVisible();
  const stillTwo = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { state: { get: () => unknown } } };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as { kind: string; ids?: unknown };
    return s?.kind === "multi";
  });
  expect(stillTwo).toBe(true);
});

test("WI-036 — multi-selection mounts a bounding-box marquee + 4 corner handles; single selection does not", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-overlay" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0 },
  });
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });
  expect(ids.length).toBe(2);

  // Single selection — no multi overlay.
  await selectFrame(page, ids[0]!);
  await expect(page.getByTestId("multi-selection-overlay")).toHaveCount(0);

  // Multi-selection — overlay + 4 corner handles mount.
  await selectFrames(page, ids);
  const overlay = page.getByTestId("multi-selection-overlay");
  await expect(overlay).toBeVisible({ timeout: 3_000 });
  await expect(overlay.locator("[data-multi-corner='nw']")).toBeVisible();
  await expect(overlay.locator("[data-multi-corner='ne']")).toBeVisible();
  await expect(overlay.locator("[data-multi-corner='sw']")).toBeVisible();
  await expect(overlay.locator("[data-multi-corner='se']")).toBeVisible();

  // Clearing selection removes the overlay.
  await clearSelection(page);
  await expect(overlay).toHaveCount(0, { timeout: 1_000 });
});

test("WI-036 — dragging a multi-selection corner handle resizes every selected frame proportionally", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-resize" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.5, width: 0.2, height: 0.2, rotation: 0 },
  });
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });
  await selectFrames(page, ids);

  // Capture pre-drag frames.
  const before = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            attrs: { frame?: { x: number; y: number; width: number; height: number } };
          }>;
        };
      };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => ({
      id: String(c.id),
      ...(c.attrs.frame as { x: number; y: number; width: number; height: number }),
    }));
  });

  // Drag the SE corner outward by ~80 px → bounding box grows; all
  // selected frames should scale up proportionally.
  const se = page.locator("[data-multi-corner='se']");
  await expect(se).toBeVisible({ timeout: 3_000 });
  const seBox = await se.boundingBox();
  expect(seBox).not.toBeNull();
  if (seBox === null) return;
  const startX = seBox.x + seBox.width / 2;
  const startY = seBox.y + seBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 80, startY + 80, { steps: 8 });
  await page.mouse.up();

  const after = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            attrs: { frame?: { x: number; y: number; width: number; height: number } };
          }>;
        };
      };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => ({
      id: String(c.id),
      ...(c.attrs.frame as { x: number; y: number; width: number; height: number }),
    }));
  });

  // Each frame's width + height should have GROWN (SE drag enlarges).
  for (const a of after) {
    const b = before.find((x) => x.id === a.id);
    expect(b).not.toBeUndefined();
    if (b === undefined) continue;
    expect(a.width).toBeGreaterThan(b.width);
    expect(a.height).toBeGreaterThan(b.height);
  }
});

test("WI-036 — multi-resize is a single undoable step (Cmd+Z reverts every frame in one stroke)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-undo" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.5, width: 0.2, height: 0.2, rotation: 0 },
  });
  const ids = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });
  await selectFrames(page, ids);

  const before = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            attrs: { frame?: { x: number; y: number; width: number; height: number } };
          }>;
        };
      };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => ({
      id: String(c.id),
      ...(c.attrs.frame as { x: number; y: number; width: number; height: number }),
    }));
  });

  const se = page.locator("[data-multi-corner='se']");
  await expect(se).toBeVisible({ timeout: 3_000 });
  const seBox = await se.boundingBox();
  expect(seBox).not.toBeNull();
  if (seBox === null) return;
  await page.mouse.move(seBox.x + seBox.width / 2, seBox.y + seBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(seBox.x + 80, seBox.y + 80, { steps: 8 });
  await page.mouse.up();

  // One Cmd+Z should fully revert. (Per-frame `weave.item.update`
  // would have required N undos; `weave.items.resizeMulti` collapses
  // to a single transaction.)
  await page.keyboard.press("ControlOrMeta+z");

  const after = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            id: unknown;
            attrs: { frame?: { x: number; y: number; width: number; height: number } };
          }>;
        };
      };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => ({
      id: String(c.id),
      ...(c.attrs.frame as { x: number; y: number; width: number; height: number }),
    }));
  });

  // Every frame matches its pre-drag value.
  for (const b of before) {
    const a = after.find((x) => x.id === b.id);
    expect(a).not.toBeUndefined();
    if (a === undefined) continue;
    expect(a.x).toBeCloseTo(b.x, 3);
    expect(a.y).toBeCloseTo(b.y, 3);
    expect(a.width).toBeCloseTo(b.width, 3);
    expect(a.height).toBeCloseTo(b.height, 3);
  }
});

test("WI-036 — deleting the selected frame clears the bar (no stale menu)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-036-stale" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.4, width: 0.4, height: 0.3, rotation: 0 },
  });
  const parentId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  await selectFrame(page, parentId);
  await expect(page.getByTestId("cmd-frame-addChild")).toBeVisible({ timeout: 3_000 });

  await page.evaluate((pid) => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (id: string, input: unknown) => unknown };
      __weaveDoc?: { root: { id: unknown } };
    };
    const rootId = w.__weaveDoc !== undefined ? String(w.__weaveDoc.root.id) : "";
    w.__weaveEditor?.exec("weave.item.remove", { containerId: rootId, itemId: pid });
  }, parentId);

  await expect(page.getByTestId("cmd-frame-addChild")).toHaveCount(0, { timeout: 1_000 });
});
