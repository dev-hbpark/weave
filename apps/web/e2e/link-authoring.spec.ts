// WI-090 Phase 2 (DR-052) — link-unit authoring UI. The cross-kind LinkSection
// in the ContextualToolbar lets a user attach a link (URL / slide jump) to ANY
// selected item. Unlike the present-mode runtime spec, authoring lives entirely
// on the design page (no /present reload), so it is NOT blocked by the offline
// edit-persistence gate — these assertions read the live editor doc.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type Action =
  | { type: "external"; href: string }
  | { type: "jump-camera"; targetId: string }
  | { type: string };

/** Read the first button-trigger action on `itemId` from the live doc, or null. */
async function readLinkAction(page: Page, itemId: string): Promise<Action | null> {
  return page.evaluate((id) => {
    type Node = {
      id: unknown;
      children: ReadonlyArray<Node>;
      units?: ReadonlyArray<{ kind: string; attrs: { behavior?: { action?: unknown } } }>;
    };
    const root = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc?.root;
    if (root === undefined) return null;
    const find = (n: Node): Node | null => {
      if (String(n.id) === id) return n;
      for (const c of n.children) {
        const hit = find(c);
        if (hit !== null) return hit;
      }
      return null;
    };
    const item = find(root);
    const unit = item?.units?.find((u) => u.kind === "button-trigger");
    return (unit?.attrs.behavior?.action as Action | undefined) ?? null;
  }, itemId);
}

/** First item of `kind` in the live doc, polling until it appears (the
 *  `__weaveDoc` global refreshes a render after the editing exec). */
async function firstKindId(page: Page, kind: string): Promise<string> {
  const handle = await page.waitForFunction((k) => {
    type Node = { id: unknown; kind: string; children: ReadonlyArray<Node> };
    const root = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc?.root;
    if (root === undefined) return null;
    let hit: string | null = null;
    const walk = (n: Node): void => {
      if (hit === null && n.kind === k) hit = String(n.id);
      for (const c of n.children) walk(c);
    };
    root.children.forEach(walk);
    return hit;
  }, kind);
  return handle.jsonValue() as Promise<string>;
}

test("attach a URL link to a shape, then switch it to a slide jump", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "link-authoring" });

  // One slide (frame) so the slide-jump picker has a target.
  await addFrame(page, "frame");
  const frameId = await firstKindId(page, "frame");
  expect(frameId).not.toBe("");

  // Add a shape — it becomes the selection, so the contextual toolbar + link
  // controls appear.
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape").click();
  await page.getByTestId("add-shape-rectangle").click();
  const shapeId = await firstKindId(page, "shape");
  expect(shapeId).not.toBe("");

  await expect(page.getByTestId("contextual-toolbar")).toBeVisible();
  await expect(page.getByTestId("link-controls")).toBeVisible();
  // No link yet.
  expect(await readLinkAction(page, shapeId)).toBeNull();

  // Mode → URL. A default https:// external link is attached.
  await page.getByTestId("link-mode-select").click();
  await page.getByTestId("link-mode-select-option-url").click();
  await expect
    .poll(() => readLinkAction(page, shapeId))
    .toEqual({
      type: "external",
      href: "https://",
    });

  // Type a real URL; blur commits it.
  const url = page.getByTestId("link-url-input");
  await url.fill("https://example.com/docs");
  await url.blur();
  await expect
    .poll(() => readLinkAction(page, shapeId))
    .toEqual({
      type: "external",
      href: "https://example.com/docs",
    });

  // Mode → Slide. The single unit is updated to a jump-camera at the frame's
  // camera id (no duplicate behavior).
  await page.getByTestId("link-mode-select").click();
  await page.getByTestId("link-mode-select-option-slide").click();
  await expect
    .poll(() => readLinkAction(page, shapeId))
    .toEqual({
      type: "jump-camera",
      targetId: `present-${frameId}`,
    });

  // Undo reverts the slide switch — the link returns to an external URL
  // (History contract; rapid behavior edits merge, so one undo lands back on
  // the external link rather than the exact prior href).
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => readLinkAction(page, shapeId).then((a) => a?.type)).toBe("external");
});

test("removing the link (mode → None) deletes the behavior", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "link-remove" });

  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape").click();
  await page.getByTestId("add-shape-rectangle").click();
  const shapeId = await firstKindId(page, "shape");
  expect(shapeId).not.toBe("");

  await page.getByTestId("link-mode-select").click();
  await page.getByTestId("link-mode-select-option-url").click();
  await expect.poll(() => readLinkAction(page, shapeId)).not.toBeNull();

  await page.getByTestId("link-mode-select").click();
  await page.getByTestId("link-mode-select-option-none").click();
  await expect.poll(() => readLinkAction(page, shapeId)).toBeNull();
});
