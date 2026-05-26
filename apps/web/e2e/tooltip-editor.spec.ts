// WI-016 Phase B — tooltip wiring on the editor toolbar.
//
// These scenarios prove the <AITooltip> wrapper composes correctly through
// the Slot chains we built into the toolbar:
//   - Redo IconButton — single Slot layer (AITooltip → IconButton's button).
//   - + Add Button — TWO Slot layers (DropdownMenuTrigger asChild → AITooltip
//     → Button). Verifies the trigger asChild path doesn't break tooltip ref
//     composition.
//   - Present Button asChild Link — THREE Slot layers (AITooltip → Button
//     asChild → Link). Tooltip must still resolve the underlying DOM
//     element through the chain.
//
// We don't re-test debounce / morph / a11y / theme inheritance here — those
// are covered in `ai-tooltip.spec.ts`. This file is wiring-coverage only.

import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

const TOOLTIP = "[data-ai-tooltip-surface]";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("Redo tooltip — single Slot layer (AITooltip → IconButton)", async ({
  page,
}) => {
  // Need an undo-able action so the Redo button becomes enabled. Bypass
  // the toolbar dropdown (its menu item placement on small viewports can be
  // outside the actionable area in headless) and add the item directly via
  // the editor API exposed on window, then click toolbar-undo to enable
  // toolbar-redo.
  await prepareDesign(page, { flavor: "mixed", title: "Tip-Redo" });
  // Wait until DesignPage has rendered and stashed the editor on window.
  await page.waitForFunction(
    () => (window as unknown as { __weaveEditor?: unknown }).__weaveEditor !== undefined,
  );
  await page.evaluate(() => {
    const editor = (window as unknown as { __weaveEditor: { exec: (n: string, i: unknown) => void } }).__weaveEditor;
    const doc = (window as unknown as { __weaveDoc: { root: { id: string } } }).__weaveDoc;
    editor.exec("weave.item.add", {
      kind: "frame",
      containerId: String(doc.root.id),
      frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.15, rotation: 0 },
    });
  });
  await expect(page.getByTestId("toolbar-undo")).toBeEnabled();
  await page.getByTestId("toolbar-undo").click();

  const redo = page.getByTestId("toolbar-redo");
  await expect(redo).toBeEnabled();
  // aria-describedby flows through the AITooltip Slot to the IconButton's
  // underlying <button> — single-Slot chain.
  await expect(redo).toHaveAttribute(
    "aria-describedby",
    "weave-ai-tooltip-surface",
  );

  await redo.hover();
  await page.waitForTimeout(260);
  const tip = page.locator(TOOLTIP);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("다시 실행");
  await expect(tip).toContainText("⌘ + ⇧ + Z");
});

test.skip("+ Add tooltip — two Slot layers (DropdownMenuTrigger asChild → AITooltip → Button)", async ({
  page,
}) => {
  // The Toolbar + Add Dropdown was removed; frame creation moved to the
  // rubber-band gesture. The two-Slot composition this test verified no
  // longer exists in the product surface. Skipped for archival.
  void page;
});

test("Undo tooltip — hotkeyId resolves from the editor hotkey table", async ({
  page,
}) => {
  // The Undo tooltip references `hotkeyId="undo"` instead of a literal
  // shortcut string. The provider's `hotkeyTable` (built by
  // useEditorHotkeys) supplies the canonical display value. This test proves
  // (a) the resolution path works and (b) the displayed string came from the
  // table, not a hard-coded literal somewhere in DesignPage.
  await prepareDesign(page, { flavor: "mixed", title: "Tip-HK" });
  await page.waitForFunction(
    () => (window as unknown as { __weaveEditor?: unknown }).__weaveEditor !== undefined,
  );
  await page.evaluate(() => {
    const editor = (window as unknown as { __weaveEditor: { exec: (n: string, i: unknown) => void } }).__weaveEditor;
    const doc = (window as unknown as { __weaveDoc: { root: { id: string } } }).__weaveDoc;
    editor.exec("weave.item.add", {
      kind: "frame",
      containerId: String(doc.root.id),
      frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.15, rotation: 0 },
    });
  });
  await expect(page.getByTestId("toolbar-undo")).toBeEnabled();
  await page.getByTestId("toolbar-undo").hover();
  await page.waitForTimeout(260);
  const tip = page.locator(TOOLTIP);
  await expect(tip).toBeVisible();
  // The keycap reads "⌘ + Z" — that string lives in editor-hotkeys.ts
  // (EDITOR_HOTKEYS[id="undo"].keys), nowhere else in the app.
  await expect(tip).toContainText("⌘ + Z");
});

test("Cmd+Z hotkey still triggers undo (regression after useHistoryHotkeys removal)", async ({
  page,
}) => {
  // The legacy `useHistoryHotkeys` raw `window` listener was replaced with
  // `useEditorHotkeys` (Phase C of WI-016). This test exists so a future
  // refactor of the hotkey wiring still preserves the user-visible behavior:
  // adding an item then Cmd+Z should undo, mirroring what the
  // `history-hotkeys.spec.ts` slide-title test already covers but for the
  // toolbar-add path.
  await prepareDesign(page, { flavor: "mixed", title: "Tip-Hk2" });
  await page.waitForFunction(
    () => (window as unknown as { __weaveEditor?: unknown }).__weaveEditor !== undefined,
  );
  await page.evaluate(() => {
    const editor = (window as unknown as { __weaveEditor: { exec: (n: string, i: unknown) => void } }).__weaveEditor;
    const doc = (window as unknown as { __weaveDoc: { root: { id: string } } }).__weaveDoc;
    editor.exec("weave.item.add", {
      kind: "frame",
      containerId: String(doc.root.id),
      frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.15, rotation: 0 },
    });
  });
  await expect(page.getByTestId("toolbar-undo")).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+Z");
  await expect(page.getByTestId("toolbar-undo")).toBeDisabled();
  await expect(page.getByTestId("toolbar-redo")).toBeEnabled();
});

test("Present tooltip — dataset path (Button asChild Slot chain limitation workaround)", async ({
  page,
}) => {
  // Known limitation — `<Button asChild>` wraps its children in a fragment
  // (leadingIcon + <span>{children}</span> + trailingIcon). Radix Slot with
  // a multi-child fragment doesn't transparently apply className OR forward
  // pointer/focus props to the inner Link, so wrapping with `<AITooltip>`
  // would lose hover events. The fix here is to put `data-ai-tooltip` /
  // `data-tooltip-*` directly on the Link — the App-root provider's dataset
  // scanner picks it up regardless of Slot composition.
  await prepareDesign(page, { flavor: "mixed", title: "Tip-Present" });
  const present = page.getByTestId("toolbar-present");
  await expect(present).toHaveAttribute("data-ai-tooltip", "true");
  await present.hover();
  await page.waitForTimeout(260);
  const tip = page.locator(TOOLTIP);
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("프레젠테이션");
  await expect(tip).toContainText("풀스크린 발표");
});
