// Source-less video placeholder — mirrors the image source-less placeholder
// (WI-076). A video added with no `src`:
//   • with no poster  → a neutral framed box with a play glyph + the `alt`
//                        description drawn as a centered caption.
//   • with a poster   → the poster rendered as a static COVER IMAGE + play badge.
// The agent (Aku) creates source-less media for wireframe/layout drafts, so the
// canvas must never show an empty black <video>. Seeded via the editor-exec dev
// global (the UI "+" dialog forces a URL, so it can't reach the source-less state).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

/** Add a top-level video item (into the design root) with the given attrs and
 *  return its id. Goes through `weave.item.add` exactly like the agent does. */
async function addVideo(
  page: Page,
  attrsOverride: Record<string, unknown>,
): Promise<string> {
  await page.waitForFunction(() => {
    const w = window as unknown as { __weaveEditor?: unknown; __weaveDoc?: unknown };
    return w.__weaveEditor !== undefined && w.__weaveDoc !== undefined;
  });
  return page.evaluate((attrs) => {
    type Editor = { exec: (name: string, input: unknown) => unknown };
    type Doc = { root: { children: ReadonlyArray<{ id: unknown }> } };
    const w = window as unknown as { __weaveEditor?: Editor; __weaveDoc?: Doc };
    const editor = w.__weaveEditor;
    if (editor === undefined) throw new Error("addVideo: __weaveEditor not ready");
    editor.exec("weave.item.add", {
      kind: "video",
      frame: { x: 0.2, y: 0.2, width: 0.6, height: 0.5, rotation: 0 },
      attrsOverride: attrs,
    });
    const doc = w.__weaveDoc;
    const kids = doc?.root.children ?? [];
    return String(kids[kids.length - 1]?.id);
  }, attrsOverride);
}

test("source-less video with no poster → icon placeholder + alt caption", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "VID-A" });

  await addVideo(page, { alt: "제품 데모 영상", src: "" });

  const placeholder = page.getByTestId("video-placeholder");
  await expect(placeholder).toBeVisible();
  await expect(placeholder).toContainText("제품 데모 영상");
  // Never an actual <video> element when src-less.
  await expect(page.locator("video")).toHaveCount(0);
});

test("source-less video WITH a poster → poster cover image", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "VID-B" });

  const poster = "https://example.com/cover.jpg";
  await addVideo(page, { alt: "항공 b-roll", src: "", poster });

  const cover = page.getByTestId("video-poster-cover");
  await expect(cover).toBeVisible();
  await expect(cover.locator(`img[src="${poster}"]`)).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});
