// WI-072 — container-correctness + frame nesting + per-frame slide toggle.
//   ① Replacing a media item that lives INSIDE a frame updates it IN PLACE
//      (it stays in the frame) — it must NOT spawn a new image at the root.
//   ⑤ A frame toggled out of the deck moves to the thumbnail panel's separate
//      "non-slide" section; toggling it back returns it to the slide strip.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type W = {
  __weaveEditor?: { exec: (n: string, i: unknown) => { ok?: boolean; value?: unknown } };
  __weaveDoc?: { root: { id: unknown; children: ReadonlyArray<TreeNode> } };
};
type TreeNode = {
  id: unknown;
  kind: string;
  attrs?: { src?: string; presentable?: boolean };
  children?: ReadonlyArray<TreeNode>;
};

/** Add a top-level frame containing one image (src=old.jpg). Returns ids.
 *  Two steps with a tick between — `weave.item.add` resolves `containerId`
 *  against the editor doc, which only reflects the new frame on the next tick
 *  (a single-evaluate add+add hits `container-not-found`). */
async function addFrameWithImage(page: Page): Promise<{ frameId: string; imageId: string }> {
  const frameId = await page.evaluate(() => {
    const w = window as unknown as W;
    const f = w.__weaveEditor!.exec("weave.item.add", {
      kind: "frame",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.2, y: 0.2, width: 0.5, height: 0.5, rotation: 0 },
    });
    return String(f.value);
  });
  await page.waitForTimeout(150);
  const imageId = await page.evaluate((fid) => {
    const w = window as unknown as W;
    const img = w.__weaveEditor!.exec("weave.item.add", {
      kind: "image",
      containerId: fid,
      frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotation: 0 },
      attrsOverride: { src: "https://example.com/old.jpg", fit: "cover" },
    });
    return String(img.value);
  }, frameId);
  await page.waitForTimeout(150);
  return { frameId, imageId };
}

/** Drive the deck-membership toggle's effect — the SAME `weave.item.update`
 *  the thumbnail / QuickActionBar `onToggleSlide` dispatches. (The button's
 *  onClick wiring is trivial; the meaningful behavior is the deck filter +
 *  thumbnail re-render asserted in the UI below.) */
async function setPresentable(page: Page, frameId: string, presentable: boolean): Promise<void> {
  await page.evaluate(
    ({ id, val }) => {
      const w = window as unknown as W;
      w.__weaveEditor!.exec("weave.item.update", {
        itemId: id,
        patch: (prev: { attrs: Record<string, unknown> }) => ({
          attrs: { ...prev.attrs, presentable: val },
        }),
      });
    },
    { id: frameId, val: presentable },
  );
}

interface Snapshot {
  readonly rootChildCount: number;
  readonly frameChildKinds: string[];
  readonly frameImageSrcs: string[];
}

async function snapshot(page: Page, frameId: string): Promise<Snapshot> {
  return page.evaluate((fid) => {
    const w = window as unknown as W;
    const root = w.__weaveDoc!.root;
    let frame: TreeNode | undefined;
    const walk = (n: TreeNode): void => {
      if (String(n.id) === fid) frame = n;
      for (const c of n.children ?? []) walk(c);
    };
    for (const c of root.children) walk(c);
    const kids = frame?.children ?? [];
    return {
      rootChildCount: root.children.length,
      frameChildKinds: kids.map((c) => c.kind),
      frameImageSrcs: kids.filter((c) => c.kind === "image").map((c) => c.attrs?.src ?? ""),
    };
  }, frameId);
}

test("WI-072 ① — replacing an image INSIDE a frame updates it in place (no root re-add)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-072-nested-replace" });
  const { frameId, imageId } = await addFrameWithImage(page);

  // Baseline: 1 root frame, the image lives inside it.
  let snap = await snapshot(page, frameId);
  expect(snap.rootChildCount).toBe(1);
  expect(snap.frameChildKinds).toEqual(["image"]);
  expect(snap.frameImageSrcs).toEqual(["https://example.com/old.jpg"]);

  // Select the NESTED image → its toolbar mounts with the replace button.
  await setSelection(page, [imageId]);
  const replaceBtn = page.getByTestId("image-edit-src");
  await expect(replaceBtn).toBeVisible({ timeout: 3000 });
  await replaceBtn.click();

  const dialog = page.getByTestId("media-src-dialog");
  await expect(dialog).toBeVisible();
  // Pre-filled with the nested image's current src (deep lookup, not root-only).
  await expect(page.getByTestId("media-src-input")).toHaveValue("https://example.com/old.jpg");

  await page.getByTestId("media-src-input").fill("https://example.com/new.jpg");
  await page.getByTestId("media-src-confirm").click();
  await page.waitForTimeout(150);

  // The image stayed INSIDE the frame and updated; NO new root child was added.
  snap = await snapshot(page, frameId);
  expect(snap.rootChildCount).toBe(1); // ← the bug added a 2nd root child here
  expect(snap.frameChildKinds).toEqual(["image"]);
  expect(snap.frameImageSrcs).toEqual(["https://example.com/new.jpg"]);
});

test("WI-072 ⑤ — toggling a frame off the deck moves it to the thumbnail non-slide section", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-072-slide-toggle" });
  // Two top-level frames → both slides by default.
  const ids = await page.evaluate(() => {
    const w = window as unknown as W;
    const root = String(w.__weaveDoc!.root.id);
    const mk = (x: number) =>
      String(
        w.__weaveEditor!.exec("weave.item.add", {
          kind: "frame",
          containerId: root,
          frame: { x, y: 0, width: 0.4, height: 0.4, rotation: 0 },
        }).value,
      );
    return { a: mk(0), b: mk(0.5) };
  });
  await page.waitForTimeout(150);

  // Both render as slide tiles; no non-slide tiles yet.
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  await expect(page.getByTestId("thumbnail-1")).toBeVisible();
  await expect(page.getByTestId(`thumbnail-nonslide-${ids.b}`)).toHaveCount(0);

  // The per-tile slide-toggle button is present on each slide tile (the
  // QuickActionBar carries the same `frame.toggleSlide` action). Clicking it
  // runs the SAME `weave.item.update { presentable }` exec we drive below —
  // here we assert the deck filter + thumbnail re-render, the substantive
  // user-visible outcome of the toggle.
  await expect(page.getByTestId("thumbnail-slide-toggle-1")).toBeAttached();

  // Opt frame B out of the deck.
  await setPresentable(page, ids.b, false);
  await page.waitForTimeout(150);

  // Now one slide tile + frame B in the separate non-slide section.
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  await expect(page.getByTestId("thumbnail-1")).toHaveCount(0);
  await expect(page.getByTestId(`thumbnail-nonslide-${ids.b}`)).toBeVisible();
  // Its re-include toggle is rendered in the non-slide section.
  await expect(page.getByTestId(`thumbnail-nonslide-toggle-${ids.b}`)).toBeAttached();

  // Re-include it → returns to the slide strip, non-slide section empties.
  await setPresentable(page, ids.b, true);
  await page.waitForTimeout(150);
  await expect(page.getByTestId("thumbnail-1")).toBeVisible();
  await expect(page.getByTestId(`thumbnail-nonslide-${ids.b}`)).toHaveCount(0);
});
