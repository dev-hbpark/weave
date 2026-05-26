// WI-016 Phase D — kind-polymorphism + state-dependent tooltip coverage.
//
// Verifies the TooltipCapability registry (DR-011) actually dispatches per
// item kind, and that the same describer returns different content based on
// the frame's selection / entered state. These are the two polymorphism axes
// the registry pattern is supposed to deliver.

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

const TOOLTIP = "[data-ai-tooltip-surface]";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addItem(
  page: import("@playwright/test").Page,
  kind: "slide" | "canvas-design" | "block-doc" | "media",
  frame: { x: number; y: number; width: number; height: number },
): Promise<void> {
  // WI-032 Phase 3c — the legacy 4 kinds were removed; this spec is
  // already `test.skip`-ed below, but we still rewrite the kind so it
  // typechecks against the new DomainKind union without polluting the
  // skip's intent.
  void kind;
  await page.evaluate(
    ({ frame }) => {
      const editor = (
        window as unknown as {
          __weaveEditor: { exec: (n: string, i: unknown) => void };
        }
      ).__weaveEditor;
      const doc = (
        window as unknown as { __weaveDoc: { root: { id: string } } }
      ).__weaveDoc;
      editor.exec("weave.item.add", {
        kind: "frame",
        containerId: String(doc.root.id),
        frame: { ...frame, rotation: 0 },
      });
    },
    { frame },
  );
}

// The frame-level KindTooltip was retired in favor of cursor-anchored
// CursorTooltip popups attached to *inner* items (shape, paragraph, slide
// title, etc.). Frames themselves now carry no hover popup, so the original
// kind-dispatch assertion (hovering the frame chrome surfaces kind-specific
// context) no longer applies. Inner-item coverage lives next to the items
// themselves; this file's two tests are kept as a skip so the intent of the
// retirement is on record.
test.skip("kind dispatch — slide vs canvas-design vs block-doc vs media surface different context", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Tip-Kinds" });
  await page.waitForFunction(
    () => (window as unknown as { __weaveEditor?: unknown }).__weaveEditor !== undefined,
  );

  // Place each domain at a distinct frame so hover targets one at a time.
  await addItem(page, "slide", { x: 0.05, y: 0.05, width: 0.25, height: 0.25 });
  await addItem(page, "canvas-design", {
    x: 0.4,
    y: 0.05,
    width: 0.25,
    height: 0.25,
  });
  await addItem(page, "block-doc", {
    x: 0.05,
    y: 0.45,
    width: 0.25,
    height: 0.25,
  });
  await addItem(page, "media", { x: 0.4, y: 0.45, width: 0.25, height: 0.25 });

  const expectContext = async (
    testid: string,
    needle: RegExp,
  ): Promise<void> => {
    // Hover the frame's outer chrome (top-left 4px) to avoid selecting any
    // inner shape / contenteditable.
    await page.locator(`[data-frame-id="${testid}"]`).hover({
      position: { x: 4, y: 4 },
    });
    await page.waitForTimeout(260);
    await expect(page.locator(TOOLTIP)).toContainText(needle);
    // Reset between hovers.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(150);
  };

  // Read frame ids from the DOM in insertion order — same order as the
  // editor's children list.
  const ids = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-frame-id]")).map(
      (el) => el.getAttribute("data-frame-id") ?? "",
    );
  });
  expect(ids).toHaveLength(4);

  await expectContext(ids[0]!, /슬라이드|선택 — 클릭/);
  await expectContext(ids[1]!, /캔버스|도형/);
  await expectContext(ids[2]!, /문서|문단/);
  await expectContext(ids[3]!, /미디어|이미지|동영상/);
});

test.skip("state dispatch — selecting a slide swaps the tooltip context in place", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Tip-StateSwap" });
  await page.waitForFunction(
    () => (window as unknown as { __weaveEditor?: unknown }).__weaveEditor !== undefined,
  );
  await addItem(page, "slide", {
    x: 0.1,
    y: 0.1,
    width: 0.4,
    height: 0.4,
  });
  const frameId = await page.evaluate(() => {
    const el = document.querySelector("[data-frame-id]");
    return el?.getAttribute("data-frame-id") ?? "";
  });
  expect(frameId).not.toBe("");

  const frame = page.locator(`[data-frame-id="${frameId}"]`);

  // Hover the unselected frame — should describe selection as a click.
  await frame.hover({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(260);
  const tip = page.locator(TOOLTIP);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("선택 — 클릭");
  await expect(tip).not.toContainText("변형 — 핸들 드래그");

  // Click to select. The frame chrome click selects (per FrameStage rules).
  await frame.click({ position: { x: 4, y: 4 } });

  // After selection the live data refresh path (Phase A) should update the
  // visible tooltip in place — no remount, content swaps from the hover-
  // affordance set to the selected-state describer output (변형 핸들 드래그 …).
  await expect(tip).toContainText("변형 — 핸들 드래그");
  await expect(tip).toContainText("위에 추가 — ⌥ 드래그");
  await expect(tip).toHaveCount(1); // single surface, no flicker
});
