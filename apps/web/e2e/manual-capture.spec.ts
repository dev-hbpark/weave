// TOOL, not a test (WI-191) — regenerates the source material for the
// Confluence service manual ("weave 서비스 사용 매뉴얼", page 2600829088).
// Walks the real product flows, captures screenshots into manual-shots/,
// and dumps every visible UI label into manual-shots/labels.json so the
// manual's wording matches the live product exactly. It asserts nothing,
// so it is env-gated out of the regular suite:
//
//   MANUAL_CAPTURE=1 pnpm exec playwright test manual-capture

import * as fs from "node:fs";
import * as path from "node:path";
import { type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

const SHOTS = path.resolve(import.meta.dirname, "../manual-shots");
const labels: Record<string, unknown> = {};

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
});

test.afterEach(() => {
  const file = path.join(SHOTS, "labels.json");
  let prior: Record<string, unknown> = {};
  try {
    prior = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    /* first run */
  }
  fs.writeFileSync(file, JSON.stringify({ ...prior, ...labels }, null, 2));
});

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** Collect visible text + aria-labels/titles under a selector. */
async function dumpTexts(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const aria = el.getAttribute("aria-label");
      const title = el.getAttribute("title");
      const text = (el as HTMLElement).innerText?.trim().replace(/\s+/g, " ") ?? "";
      const tid = el.getAttribute("data-testid") ?? "";
      const piece = [tid, aria ?? title ?? "", text].filter(Boolean).join(" | ");
      if (piece) out.push(piece);
    }
    return out;
  }, selector);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test("walk mixed flow", async ({ page }) => {
  test.skip(process.env.MANUAL_CAPTURE === undefined, "tool, not a test — set MANUAL_CAPTURE=1");
  await clearAllDesigns(page);
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", {
      get: () => false,
      configurable: true,
    });
  });

  // ── 1. landing
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await shot(page, "01-landing");
  labels.landing = await dumpTexts(page, "button, a, h1, h2, [data-testid]");

  // ── 2. wizard
  await page.getByTestId("landing-new-design").click();
  await page.getByTestId("new-design-title").waitFor();
  labels.wizard = await dumpTexts(
    page,
    '[data-testid^="new-design"], h1, h2, h3, label, [role="dialog"] p',
  );
  await shot(page, "02-wizard");

  // ── 3. create mixed design
  const titleInput = page.getByTestId("new-design-title");
  await titleInput.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("위브 안내서");
  await page.getByTestId("new-design-flavor-mixed").click();
  await page.getByTestId("new-design-size-16:9").click();
  await page.getByTestId("new-design-create").click();
  await page.waitForURL(/\/design\/[^/]+$/);
  await page.waitForFunction(() => {
    const w = window as unknown as { __weaveEditor?: unknown; __weaveVm?: unknown };
    return w.__weaveEditor !== undefined && w.__weaveVm !== undefined;
  });
  await page.waitForLoadState("networkidle");
  await shot(page, "03-editor-empty");

  // toolbar / header inventory
  labels.header = await dumpTexts(
    page,
    '[data-testid="design-header"] button, [data-testid="design-header"] [data-testid]',
  );

  // ── 4. add menu inventory
  await page.getByTestId("toolbar-add").click();
  await page.waitForTimeout(400);
  labels.addMenu = await dumpTexts(page, '[role="menu"] [role="menuitem"], [data-testid^="add-"]');
  await shot(page, "04-add-menu");
  await page.keyboard.press("Escape");

  // ── 5. populate canvas programmatically
  await addFrame(page, "frame", {
    frame: { x: 0.06, y: 0.1, width: 0.36, height: 0.5, rotation: 0 },
  });
  await addFrame(page, "text", {
    frame: { x: 0.5, y: 0.12, width: 0.3, height: 0.12, rotation: 0 },
  });
  await addFrame(page, "shape", {
    frame: { x: 0.5, y: 0.32, width: 0.18, height: 0.25, rotation: 0 },
  });
  await page.waitForTimeout(600);
  await shot(page, "05-canvas-items");

  // ── 6. element context menu
  const ids: string[] = await page.evaluate(() => {
    interface Node {
      id: string | number;
      children: ReadonlyArray<Node>;
    }
    const doc = (window as unknown as { __weaveDoc?: { root: Node } }).__weaveDoc;
    return doc ? doc.root.children.map((c) => String(c.id)) : [];
  });
  try {
    if (ids.length > 0) {
      await setSelection(page, [ids[0] as string]);
      const block = page.locator('[data-testid="frame-block"]').first();
      const box = await block.boundingBox({ timeout: 3_000 }).catch(() => null);
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
        await page.waitForTimeout(400);
        labels.elementMenu = await dumpTexts(page, '[data-testid^="ctx-"]');
        await shot(page, "06-element-menu");
        await page.keyboard.press("Escape");
      }
    }
  } catch (e) {
    labels.elementMenuError = String(e);
  }

  // ── 7. canvas(page) context menu — right-click empty area (viewport coords;
  // the canvas fills the window below the header, so bottom-right is empty).
  try {
    const vp = page.viewportSize();
    if (vp) {
      await page.mouse.click(vp.width - 320, vp.height - 160, { button: "right" });
      await page.waitForTimeout(400);
      labels.pageMenu = await dumpTexts(page, '[data-testid^="page-ctx-"]');
      await shot(page, "07-page-menu");
      await page.keyboard.press("Escape");
    }
  } catch (e) {
    labels.pageMenuError = String(e);
  }

  // ── 8. rail (mixed overview) + tile menu — only frame-kind top-level
  // items become deck tiles, so add one more frame for a 2-tile rail and
  // target the FIRST [data-thumbnail-id] tile (index varies).
  await addFrame(page, "frame", {
    frame: { x: 0.72, y: 0.62, width: 0.2, height: 0.28, rotation: 0 },
  });
  await page.waitForTimeout(400);
  labels.railMixed = await dumpTexts(page, '[data-testid="thumbnail-panel"] [data-testid]');
  const tile = page.locator("[data-thumbnail-id]").first();
  if (await tile.isVisible().catch(() => false)) {
    await tile.click({ button: "right" });
    await page.waitForTimeout(400);
    labels.railTileMenuMixed = await dumpTexts(page, '[data-testid^="thumbnail-menu-"]');
    await shot(page, "08-rail-tile-menu-mixed");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800); // radix exit animation releases pointer lock
  }

  // ── 9. theme picker
  const theme = page.getByTestId("theme-picker");
  if (await theme.isVisible().catch(() => false)) {
    await theme.click();
    await page.waitForTimeout(500);
    labels.themePicker = await dumpTexts(page, '[role="dialog"] button, [data-testid*="theme"]');
    await shot(page, "09-theme-picker");
    await page.keyboard.press("Escape");
  }

  // ── 10. Aku panel
  const aku = page.locator('button[aria-label="아쿠 열기"]');
  if (await aku.isVisible().catch(() => false)) {
    await aku.click();
    await page.waitForTimeout(800);
    labels.aku = await dumpTexts(
      page,
      '[data-testid^="aku-"], [data-testid="aku-settings-panel"] label',
    );
    await shot(page, "10-aku-panel");
    await page.keyboard.press("Escape");
  }

  // ── 11. present mode
  const present = page.getByTestId("toolbar-present");
  if (await present.isVisible().catch(() => false)) {
    await present.click();
    await page.waitForTimeout(1500);
    labels.presentUrl = page.url();
    await shot(page, "11-present");
    labels.present = await dumpTexts(page, "button, [data-testid]");
    await page.keyboard.press("Escape");
  }
});

test("walk slide-deck flow", async ({ page }) => {
  test.skip(process.env.MANUAL_CAPTURE === undefined, "tool, not a test — set MANUAL_CAPTURE=1");
  await clearAllDesigns(page);
  await prepareDesign(page, { flavor: "slide-deck", title: "발표 자료" });
  await addFrame(page, "slide");
  await addFrame(page, "slide");
  await page.waitForTimeout(600);
  await shot(page, "20-slide-deck-editor");
  labels.railSlideDeck = await dumpTexts(page, '[data-testid="thumbnail-panel"] [data-testid]');

  const tile = page.locator('[data-testid="thumbnail-1"]');
  if (await tile.isVisible().catch(() => false)) {
    await tile.click({ button: "right" });
    await page.waitForTimeout(400);
    labels.railTileMenuSlideDeck = await dumpTexts(page, '[data-testid^="thumbnail-menu-"]');
    await shot(page, "21-rail-tile-menu-slide-deck");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800); // radix exit animation releases pointer lock
  }

  // multi-select visual — same activate-button path the WI-189 spec uses.
  try {
    await page.getByTestId("thumbnail-activate-0").click();
    await page.getByTestId("thumbnail-activate-2").click({ modifiers: ["Shift"] });
    await page.waitForTimeout(300);
    await shot(page, "22-rail-multiselect");
  } catch (e) {
    labels.multiSelectError = String(e);
  }
});
