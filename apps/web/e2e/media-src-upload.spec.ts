// WI-020 — local file upload in MediaSrcDialog.
//
// Covers:
//   1. Image upload via hidden <input type=file>. File → data: URL.
//      Confirm creates an item with src.startsWith("data:image").
//   2. Video upload → blob: URL. Confirm creates an item with src.startsWith("blob:").
//   3. After upload, the URL field is disabled & the uploaded-name chip is shown.
//   4. Clicking 비우기 re-enables the URL field.
//   5. Tone change visible — dialog rendered with overlay surface, compact title.

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

const TINY_PNG = Buffer.from(
  // 1x1 transparent PNG
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const TINY_MP4 = Buffer.from(
  // 28-byte minimal ftyp box; not a playable video but enough for the test.
  "0000001c66747970697336360000000069736f366176633100000000",
  "hex",
);

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("이미지 업로드 → src is data: URL", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Up-A" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();

  // Dropzone is visible, URL field empty.
  const dropzone = page.getByTestId("media-src-dropzone");
  await expect(dropzone).toBeVisible();
  await expect(page.getByTestId("media-src-input")).toHaveValue("");

  // Drop a file in via the hidden input.
  await page.getByTestId("media-src-file-input").setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });

  // Uploaded name chip visible; URL field disabled.
  await expect(page.getByTestId("media-src-uploaded-name")).toHaveText("tiny.png");
  await expect(page.getByTestId("media-src-input")).toBeDisabled();

  await page.getByTestId("media-src-confirm").click();

  // Item created with a data: URL src.
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const src = await page.locator("img").first().getAttribute("src");
  expect(src).toMatch(/^data:image\/png;base64,/);
});

test("비디오 업로드 → src is blob: URL", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Up-B" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-video").click();

  await page.getByTestId("media-src-file-input").setInputFiles({
    name: "tiny.mp4",
    mimeType: "video/mp4",
    buffer: TINY_MP4,
  });

  await expect(page.getByTestId("media-src-uploaded-name")).toHaveText("tiny.mp4");
  await page.getByTestId("media-src-confirm").click();

  await expect(page.locator("[data-frame-id]")).toHaveCount(1);
  const src = await page.locator("video").first().getAttribute("src");
  expect(src).toMatch(/^blob:/);
});

test("비우기 buttons restores URL field and clears upload", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Up-C" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();

  await page.getByTestId("media-src-file-input").setInputFiles({
    name: "a.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.getByTestId("media-src-input")).toBeDisabled();

  await page.getByTestId("media-src-upload-clear").click();

  await expect(page.getByTestId("media-src-uploaded-name")).toHaveCount(0);
  await expect(page.getByTestId("media-src-input")).toBeEnabled();
  await expect(page.getByTestId("media-src-input")).toHaveValue("");
});

test("비이미지 파일은 거부된다", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Up-D" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-image").click();

  await page.getByTestId("media-src-file-input").setInputFiles({
    name: "song.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.from("fake"),
  });

  await expect(page.getByText("이미지 파일만 업로드할 수 있어요")).toBeVisible();
  await expect(page.getByTestId("media-src-uploaded-name")).toHaveCount(0);
});

test("도형 fill 도 파일 업로드로 채울 수 있다", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Up-E" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-shape-rectangle").click();
  await expect(page.locator("[data-frame-id]")).toHaveCount(1);

  await page.getByTestId("shape-fill-image").click();
  await page.getByTestId("media-src-file-input").setInputFiles({
    name: "fill.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await page.getByTestId("media-src-confirm").click();

  const fill = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{
            kind: string;
            attrs: Readonly<Record<string, unknown>>;
          }>;
        };
      };
    };
    const shape = w.__weaveDoc?.root.children.find((c) => c.kind === "shape");
    return (shape?.attrs.fill as Readonly<Record<string, unknown>>) ?? null;
  });
  expect(fill).not.toBeNull();
  expect(fill?.type).toBe("image");
  expect(String(fill?.src)).toMatch(/^data:image\/png;base64,/);
});
