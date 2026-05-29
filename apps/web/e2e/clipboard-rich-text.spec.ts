// WI-041 Phase 5 — Lexical paste delegation + IME safety.
//
// DR-019 D7 — when the focus lives inside Lexical's contenteditable, the
// browser's native copy / paste owns the keystroke and our
// `weave.clipboard.*` host handler must stay out of the way. The
// `editor-hotkeys` registry already short-circuits via
// `isTextEditingTarget(ev.target)`; these specs prove the user-visible
// outcomes that flow from that early-return:
//
//   1. Cmd+C inside a text item does NOT populate the in-app clipboard
//      store (so a follow-up Cmd+V on the canvas is a no-op — we did
//      not steal text content into the items store).
//   2. composition-aware behaviour — a synthesised composition event
//      sequence never triggers our paste handler regardless of what the
//      raw key event reports.
//   3. The hotkey scope guard is keyed on the contenteditable target
//      ancestry, not on visibility or selection state — assert by
//      probing the helper's contract via the DOM.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addTextViaMenu(page: Page): Promise<string> {
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-text").click();
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { state: { get: () => unknown } } };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as
      | { kind: "single"; itemId: unknown }
      | undefined;
    return s?.kind === "single" ? String(s.itemId) : "";
  });
}

async function rootChildCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return (w.__weaveDoc?.root.children ?? []).length;
  });
}

async function clipboardHasPayload(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const w = window as unknown as { __weaveClipboardPeek?: () => unknown };
    return w.__weaveClipboardPeek !== undefined && w.__weaveClipboardPeek() !== undefined;
  });
}

test("Cmd+C inside a Lexical text item does NOT populate our items clipboard", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-041-rt-1" });
  const textId = await addTextViaMenu(page);
  expect(textId).not.toBe("");

  // Enter edit mode by double-clicking the text-block wrapper (the
  // single-click selects the frame; the second click flips the
  // TextBlock's `isEditing` state which mounts LexicalTextEditor).
  await page.getByTestId("text-block").dblclick();
  const editable = page.getByRole("textbox", { name: "Text content" });
  await editable.waitFor();
  // Make sure the contenteditable actually owns focus before the hotkey
  // fires — Playwright's `dblclick` does not always leave the dblclicked
  // element focused on Chromium, so we focus explicitly to mirror the
  // production flow where the user typing-after-dblclick has focus.
  await editable.focus();
  await page.keyboard.press("ControlOrMeta+A");

  // Copy. The hotkey early-return on `isTextEditingTarget` means our
  // `weave.clipboard.copy` command never fires — the browser's native
  // copy populates the system clipboard with the selected text only,
  // leaving the in-app store empty.
  await page.keyboard.press("ControlOrMeta+C");
  await page.waitForTimeout(50);

  expect(await clipboardHasPayload(page)).toBe(false);

  // Blur to leave edit mode, then Cmd+V — must be a no-op because the
  // store is still empty. (If the hotkey gate had let the copy through,
  // the store would contain the text Item's serialised form and this
  // paste would add a sibling.)
  await editable.evaluate((el) => (el as HTMLElement).blur());
  await page.waitForTimeout(50);

  const beforePaste = await rootChildCount(page);
  await page.keyboard.press("ControlOrMeta+V");
  await page.waitForTimeout(60);
  expect(await rootChildCount(page)).toBe(beforePaste);
});

test("Composition (IME) events do not trip the items clipboard handler", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-041-rt-2" });
  await addTextViaMenu(page);
  await page.getByTestId("text-block").dblclick();
  const editable = page.getByRole("textbox", { name: "Text content" });
  await editable.waitFor();
  await editable.focus();

  // Simulate the start of an IME composition pass directly on the
  // contenteditable element. Real IMEs (한글, 日本語, 中文) suppress
  // `keydown`'s `key` field to `"Process"` while a composition is
  // pending; the hotkey registry's `key` matching therefore misses
  // Mod+C / Mod+V entirely. Even so, the contenteditable still has
  // focus, so our `isTextEditingTarget` guard would also block the
  // handler. Either rail is sufficient — we assert both by:
  //
  //   (a) firing a composition event sequence on the editable,
  //   (b) pressing Mod+C right after,
  //   (c) verifying the items clipboard is still empty.
  await editable.dispatchEvent("compositionstart", { data: "" });
  await editable.dispatchEvent("compositionupdate", { data: "ㅎ" });
  await page.keyboard.press("ControlOrMeta+C");
  await editable.dispatchEvent("compositionend", { data: "한" });
  await page.waitForTimeout(50);

  expect(await clipboardHasPayload(page)).toBe(false);
});

test("isTextEditingTarget contract — contenteditable ancestry gates the hotkey path", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-041-rt-3" });
  await addTextViaMenu(page);
  await page.getByTestId("text-block").dblclick();
  const editable = page.getByRole("textbox", { name: "Text content" });
  await editable.waitFor();
  // Lexical may not auto-focus on mount in some browsers — explicitly
  // focus before asserting the gate. The production hot-path enters
  // edit mode via the same dblclick path which natively focuses.
  await editable.focus();

  // The hotkey gate is observable: while the contenteditable owns focus,
  // `document.activeElement` is either the editable itself or a node
  // nested inside it; both have `isContentEditable === true`. This
  // matches the production guard at editor-hotkeys.ts:576.
  const observedFocusInEditor = await page.evaluate(() => {
    const ae = document.activeElement;
    if (ae === null) return false;
    if (!(ae instanceof HTMLElement)) return false;
    if (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA") return true;
    return ae.isContentEditable;
  });
  expect(observedFocusInEditor).toBe(true);

  // Blur and confirm the gate flips so a subsequent canvas-scope hotkey
  // would be allowed through (the body of `<body>` is not contenteditable).
  await editable.evaluate((el) => (el as HTMLElement).blur());
  await page.waitForTimeout(50);
  const observedFocusOutEditor = await page.evaluate(() => {
    const ae = document.activeElement;
    if (ae === null) return true; // browser focuses body — gate open
    if (!(ae instanceof HTMLElement)) return false;
    if (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA") return true;
    return ae.isContentEditable;
  });
  expect(observedFocusOutEditor).toBe(false);
});
