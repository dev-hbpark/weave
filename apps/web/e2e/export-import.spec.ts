// WI-089 — design-selection export / import e2e.
//
// Verifies the file transport end-to-end against the live runtime:
//   1. Export the selected shape via the File menu → a `.json` download
//      whose bytes carry the `weave/design-selection` envelope + 1 item.
//   2. Import that exact file back through the hidden picker → a fresh
//      child appears (new id), proving the paste pipeline ran.
//   3. A single Cmd+Z reverts the import (the import-paste is one
//      transaction — the History contract from CLAUDE.md).
//
// The export + import reuse the WI-041 clipboard machinery, so this spec
// only has to prove the file ↔ payload bridge, not re-test paste internals.

import { expect, type Page, test } from "@playwright/test";
import { nn } from "../src/lib/nn.js";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function rootChildIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).map((c) => String(c.id));
  });
}

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
}

test("export selection → import the file → a copy appears, one Cmd+Z reverts it", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-089-export-import" });
  await addFrame(page, "shape", {
    frame: { x: 0.2, y: 0.2, width: 0.2, height: 0.2, rotation: 0 },
  });

  const before = await rootChildIds(page);
  expect(before.length).toBe(1);
  const original = nn(before[0]);
  await select(page, original);

  // 1. Export via the File menu, capturing the download bytes.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("toolbar-file-menu").click();
  await page.getByTestId("file-export-selection").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-selection\.json$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const buffer = Buffer.concat(chunks);
  const parsed = JSON.parse(buffer.toString("utf8"));
  expect(parsed._weave).toBe("weave/design-selection");
  expect(parsed.itemCount).toBe(1);
  expect(parsed.payload.kind).toBe("weave/items.v1");

  // 2. Import the same bytes back through the hidden file input.
  await page.getByTestId("import-file-input").setInputFiles({
    name: "wi-089-selection.json",
    mimeType: "application/json",
    buffer,
  });

  await expect.poll(() => rootChildIds(page).then((ids) => ids.length)).toBe(2);
  const after = await rootChildIds(page);
  const newId = after.find((id) => !before.includes(id));
  expect(newId).toBeDefined();
  expect(newId).not.toBe(original);

  // 3. A single undo removes the imported subtree (one transaction).
  await page.keyboard.press("ControlOrMeta+Z");
  await expect.poll(() => rootChildIds(page).then((ids) => ids.length)).toBe(1);
});

test("importing a non-weave JSON file surfaces an error and adds nothing", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-089-bad-import" });
  await addFrame(page, "shape", {
    frame: { x: 0.3, y: 0.3, width: 0.2, height: 0.2, rotation: 0 },
  });
  const before = await rootChildIds(page);

  await page.getByTestId("import-file-input").setInputFiles({
    name: "not-weave.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ hello: "world" }), "utf8"),
  });

  // The feedback banner appears and no child is added.
  await expect(page.getByTestId("export-import-info")).toBeVisible();
  const after = await rootChildIds(page);
  expect(after.length).toBe(before.length);
});
