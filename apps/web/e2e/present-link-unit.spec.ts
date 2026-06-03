// WI-090 (DR-052) — the "link unit". A `button-trigger` behavior on ANY item
// makes that item a clickable link in Present mode:
//   • action `external`     → opens a URL in a new tab (window.open _blank)
//   • action `jump-camera`  → navigates to a slide (camera id `present-${frameId}`)
//
// Phase 1 is the present-mode RUNTIME: `ItemInteractionLayer` dispatches the
// behavior via the interaction registry for root primitives, nested children,
// AND slide frames — not just slide frames (the pre-WI-090 limitation). This
// spec injects behaviors through the exposed editor (the authoring UI is
// Phase 2) and verifies the runtime end-to-end.
//
// SKIPPED (harness limitation, not a product gap): a freshly-created design's
// post-wizard edits never survive the navigation into the /present route. The
// e2e dev server is plain `vite` with no `/api` functions, so persistence runs
// offline through localStorage — and the offline-edit conflict gate keeps the
// debounced auto-save suppressed after the wizard's initial save (see
// use-design.ts `resolveLocalConflict`). Present then reloads the seed-only
// design and reports "no camera targets". The same limitation is why the other
// present-interaction specs (present-poc camera-fit, present-primitives image)
// are skipped. The runtime wiring is verified deterministically instead by
// `src/document/interactions/button-trigger.test.tsx`. Unskip once the e2e
// harness can persist editor mutations into a present reload (mock `/api`).

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.skip(true, "edit-persistence into /present is unavailable in the offline e2e harness");

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

/** Add a `shape` child into `containerId` via the exposed editor; returns the
 *  new item id. `__weaveDoc` only refreshes on the next React render, so the
 *  exec and the id read are separate steps with a poll in between. */
async function addChildShape(
  page: Page,
  containerId: string,
  frame: { x: number; y: number; width: number; height: number },
): Promise<string> {
  await page.evaluate(
    ({ containerId, frame }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (cmd: string, input: unknown) => unknown };
      };
      if (w.__weaveEditor === undefined) throw new Error("editor not ready");
      w.__weaveEditor.exec("weave.item.add", {
        kind: "shape",
        containerId,
        frame: { ...frame, rotation: 0 },
        attrsOverride: { shape: "rectangle" },
      });
    },
    { containerId, frame },
  );
  return page
    .waitForFunction((parentId) => {
      type Node = { id: unknown; kind: string; children: ReadonlyArray<Node> };
      const w = window as unknown as { __weaveDoc?: { root: Node } };
      const root = w.__weaveDoc?.root;
      if (root === undefined) return null;
      const find = (n: Node): Node | null => {
        if (String(n.id) === parentId) return n;
        for (const c of n.children) {
          const hit = find(c);
          if (hit !== null) return hit;
        }
        return null;
      };
      const parent = find(root);
      const shape = parent?.children.find((c) => c.kind === "shape");
      return shape ? String(shape.id) : null;
    }, containerId)
    .then((handle) => handle.jsonValue() as Promise<string>);
}

/** Attach a button-trigger (link) behavior to an item via the exposed editor. */
async function addLinkBehavior(
  page: Page,
  itemId: string,
  behaviorId: string,
  action: { type: "external"; href: string } | { type: "jump-camera"; targetId: string },
): Promise<void> {
  await page.evaluate(
    ({ itemId, behaviorId, action }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (cmd: string, input: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.item.addBehavior", {
        itemId,
        behavior: { kind: "button-trigger", id: behaviorId, action },
      });
    },
    { itemId, behaviorId, action },
  );
}

test("link unit: external action opens a URL in a new tab from a nested item", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // `mixed` seeds an empty design, so the only frames are the ones we add →
  // deterministic presentation order: frame1 = step 0, frame2 = step 1.
  const id = await prepareDesign(page, { flavor: "mixed", title: "link-ext" });
  await addFrame(page, "frame", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } });

  const frame1Id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string }> } };
    };
    const f = w.__weaveDoc?.root.children.find((c) => c.kind === "frame");
    return f ? String(f.id) : "";
  });
  expect(frame1Id).not.toBe("");

  const shapeId = await addChildShape(page, frame1Id, { x: 0.1, y: 0.1, width: 0.3, height: 0.3 });
  expect(shapeId).not.toBe("");
  await addLinkBehavior(page, shapeId, "lnk-ext", {
    type: "external",
    href: "https://example.com/ext",
  });

  // Let the autosave flush to localStorage before present reloads the design.
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(200);
  await page.goto(`/design/${id}/present`);
  await page.waitForTimeout(150);
  await expect(page.getByTestId("present-scene").first()).toBeVisible();

  // Capture window.open calls (the new-tab open) without navigating away.
  await page.evaluate(() => {
    const captured: Array<unknown[]> = [];
    (window as unknown as { __opened: unknown[][] }).__opened = captured;
    window.open = (...args: unknown[]) => {
      captured.push(args);
      return null;
    };
  });

  const link = page.locator(`[data-item-id="${shapeId}"] [data-testid="present-link"]`);
  await expect(link).toHaveAttribute("data-button-action", "external");
  await link.click();

  const opened = await page.evaluate(
    () => (window as unknown as { __opened: unknown[][] }).__opened,
  );
  expect(opened.length).toBe(1);
  expect(opened[0]?.[0]).toBe("https://example.com/ext");
  expect(opened[0]?.[1]).toBe("_blank");
});

test("link unit: jump-camera action navigates to the target slide", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = await prepareDesign(page, { flavor: "mixed", title: "link-jump" });
  // Two slides: frame1 (step 0, active) holds the link; frame2 (step 1) is the
  // jump target.
  await addFrame(page, "frame", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } });
  await addFrame(page, "frame", { frame: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } });

  const frameIds = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown; kind: string }> } };
    };
    return (w.__weaveDoc?.root.children ?? [])
      .filter((c) => c.kind === "frame")
      .map((c) => String(c.id));
  });
  expect(frameIds.length).toBe(2);
  const frame1Id = frameIds[0] as string;
  const frame2Id = frameIds[1] as string;

  const shapeId = await addChildShape(page, frame1Id, {
    x: 0.35,
    y: 0.35,
    width: 0.3,
    height: 0.3,
  });
  await addLinkBehavior(page, shapeId, "lnk-jump", {
    type: "jump-camera",
    targetId: `present-${frame2Id}`,
  });

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(200);
  await page.goto(`/design/${id}/present`);
  await page.waitForTimeout(150);
  await expect(page.getByTestId("present-scene").first()).toBeVisible();

  // Step 0 active = frame1.
  const activeScene = page.locator('[data-testid="present-scene"][aria-current="true"]');
  await expect(activeScene).toHaveAttribute("data-entry-id", frame1Id);

  // Click the link → camera jumps to frame2's slide.
  await page.locator(`[data-item-id="${shapeId}"] [data-testid="present-link"]`).click();
  await expect(activeScene).toHaveAttribute("data-entry-id", frame2Id);
});
