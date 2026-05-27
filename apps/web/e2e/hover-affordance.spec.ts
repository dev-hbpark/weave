// WI-040 Phase 3 — HoverAffordanceLayer DesignPage wiring.
//
// Verifies the layer mounts the right tier set for real document
// state, hides under non-idle / peek modes (relies on Phase 1 gates),
// and respects the selection-exclusion rule (DR-design-016).
//
// 2026-05-27 scope update: tier set is now { hovered, descendants
// (own subtree), parent (direct parent, skipping root) }. Tree
// siblings are NOT projected — hovering an item must not paint any
// chrome on its peers.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

interface ViewportRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

async function rectOfFrame(page: Page, frameId: string): Promise<ViewportRect> {
  return await page.evaluate((id) => {
    const el = document.querySelector(`[data-frame-id="${id}"]`) as HTMLElement | null;
    if (el === null) throw new Error(`no element for frame ${id}`);
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, frameId);
}

async function lastFrameId(page: Page, parentIndex?: number): Promise<string> {
  const id = await page.evaluate((pi) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{ id: unknown; children: ReadonlyArray<{ id: unknown }> }>;
        };
      };
    };
    const root = w.__weaveDoc?.root;
    if (root === undefined) return "";
    if (pi !== undefined) {
      const p = root.children[pi];
      const last = p?.children?.at(-1);
      return last === undefined ? "" : String(last.id);
    }
    const last = root.children.at(-1);
    return last === undefined ? "" : String(last.id);
  }, parentIndex);
  if (id === "") throw new Error("no frames in design");
  return id;
}

test("hovering a leaf top-level frame: hovered only (no siblings, no parent — root skipped, no descendants)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 P3 leaf hover" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.5, width: 0.7, height: 0.3, rotation: 0 },
  });
  const targetId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String(w.__weaveDoc?.root.children?.[0]?.id ?? "");
  });
  const rect = await rectOfFrame(page, targetId);
  await page.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2);

  await expect(page.locator('[data-hover-tier="hovered"]')).toHaveCount(1);
  // Other top-level frames are tree siblings — NOT projected.
  await expect(page.locator('[data-hover-tier="descendant"]')).toHaveCount(0);
  // Root is skipped — no parent tier on a top-level hover.
  await expect(page.locator('[data-hover-tier="parent"]')).toHaveCount(0);
});

test("hovering a top-level frame with children: hovered + descendant tiers, no parent (root skipped)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 P3 root with kids" });
  await addFrame(page, "frame", {
    frame: { x: 0.15, y: 0.15, width: 0.7, height: 0.7, rotation: 0 },
  });
  const rootFrameId = await lastFrameId(page);
  await addFrame(page, "frame", {
    containerId: rootFrameId,
    frame: { x: 0.05, y: 0.05, width: 0.4, height: 0.9, rotation: 0 },
  });
  await addFrame(page, "frame", {
    containerId: rootFrameId,
    frame: { x: 0.55, y: 0.05, width: 0.4, height: 0.9, rotation: 0 },
  });
  // Hover the parent — descendants should be the two children.
  // Aim for the top-center strip (between the children's vertical 0.05
  // gap) so the pointer lands on the parent's own chrome.
  const rect = await rectOfFrame(page, rootFrameId);
  await page.mouse.move(rect.left + rect.width / 2, rect.top + 6);

  await expect(page.locator('[data-hover-tier="hovered"]')).toHaveCount(1);
  await expect(page.locator('[data-hover-tier="descendant"]')).toHaveCount(2);
  await expect(page.locator('[data-hover-tier="parent"]')).toHaveCount(0);
});

test("hovering a nested leaf frame: hovered + parent tiers, no descendants, no siblings", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 P3 nested hover" });
  await addFrame(page, "frame", {
    frame: { x: 0.15, y: 0.15, width: 0.7, height: 0.7, rotation: 0 },
  });
  const parentId = await lastFrameId(page);
  await addFrame(page, "frame", {
    containerId: parentId,
    frame: { x: 0.05, y: 0.05, width: 0.4, height: 0.9, rotation: 0 },
  });
  await addFrame(page, "frame", {
    containerId: parentId,
    frame: { x: 0.55, y: 0.05, width: 0.4, height: 0.9, rotation: 0 },
  });
  const childA = await lastFrameId(page, 0);
  const rect = await rectOfFrame(page, childA);
  await page.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2);

  await expect(page.locator('[data-hover-tier="hovered"]')).toHaveCount(1);
  // childA is a leaf and its tree sibling (the second nested frame) is
  // NOT projected.
  await expect(page.locator('[data-hover-tier="descendant"]')).toHaveCount(0);
  await expect(page.locator('[data-hover-tier="parent"]')).toHaveCount(1);
});

test("hovering a selected frame suppresses its hovered tier (selection-exclusion rule)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 P3 selection exclusion" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.1, width: 0.3, height: 0.3, rotation: 0 },
  });
  const firstId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String(w.__weaveDoc?.root.children?.[0]?.id ?? "");
  });
  const rect = await rectOfFrame(page, firstId);
  // Click selects.
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
  // Hover stays on the same frame after the click.
  await page.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2);

  // Selected frame's hovered tier suppressed — SelectionLayer owns the
  // chrome. No descendants (it's a leaf). No siblings (scope change).
  await expect(page.locator('[data-hover-tier="hovered"]')).toHaveCount(0);
  await expect(page.locator('[data-hover-tier="descendant"]')).toHaveCount(0);
  await expect(page.locator('[data-hover-tier="sibling"]')).toHaveCount(0);
});

test("hover overlay disappears in peek mode (uses Phase 1 affordance gate)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 P3 peek hides" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.5, width: 0.3, height: 0.3, rotation: 0 },
  });
  const firstId = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String(w.__weaveDoc?.root.children?.[0]?.id ?? "");
  });
  const rect = await rectOfFrame(page, firstId);
  await page.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await expect(page.locator('[data-hover-tier="hovered"]')).toHaveCount(1);

  // Toggle Peek — layer goes away entirely.
  await page.getByTestId("toolbar-peek").click();
  await expect(page.getByTestId("hover-affordance-layer")).toHaveCount(0);

  // Toggle Peek off — layer + hovered tier return (cursor still over
  // the first frame).
  await page.getByTestId("toolbar-peek").click();
  await page.mouse.move(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await expect(page.getByTestId("hover-affordance-layer")).toHaveCount(1);
});
