// DR-056 — the History-contract gate for text editing.
//
// CLAUDE.md ("Document mutation rule") requires that every document mutation be
// undoable, and that "an e2e test covers Cmd+Z reverting that mutation". Text
// editing previously had NO such coverage (the R4 Cmd+B/I/U specs are
// `test.fixme` for the Playwright `beforeinput` reason). This spec closes the
// gap for the post-edit tier: after a text item is edited and edit mode is
// exited, the weave `editor.history` owns Cmd+Z / Cmd+Shift+Z.
//
// (Intra-edit Cmd+Z is owned by Lexical's HistoryPlugin and is intentionally
// out of scope here — see DR-056 for the two-tier ownership model.)

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

async function readText(page: Page, id: string): Promise<string | null> {
  return page.evaluate((tid) => {
    type Node = { id: unknown; attrs: { text?: string }; children: ReadonlyArray<Node> };
    const w = window as unknown as { __weaveDoc?: { root: Node } };
    function find(n: Node): Node | undefined {
      if (String(n.id) === tid) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== undefined) return r;
      }
      return undefined;
    }
    const root = w.__weaveDoc?.root;
    if (root === undefined) return null;
    return find(root)?.attrs.text ?? null;
  }, id);
}

async function enterEditTypeExit(page: Page): Promise<void> {
  await page.getByTestId("text-block").dblclick();
  const editable = page.getByRole("textbox", { name: "Text content" });
  await editable.waitFor();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("EDITED");
  await page.keyboard.press("Escape");
}

test("editing a text item then Cmd+Z reverts the edit (post-edit weave history)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "history-text" });
  const textId = await addTextViaMenu(page);
  expect(textId).not.toBe("");
  await expect.poll(() => readText(page, textId)).not.toBe("");
  const original = await readText(page, textId);

  await enterEditTypeExit(page);
  await expect.poll(() => readText(page, textId)).toBe("EDITED");

  // Cmd+Z (focus is no longer the editor) → weave history reverts the edit.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => readText(page, textId)).not.toBe("EDITED");
  expect(await readText(page, textId)).toBe(original);
});

// DR-058 — the redo half of the contract. Previously blocked: a text item in an
// auto-size mode (the default) recomputed its frame via the auto-fit
// ResizeObserver AFTER an undo reverted the content, committing the size as a
// fresh `weave.item.update` (user-command origin) that CLEARED the redo stack.
// DR-058 makes the auto-fit observer skip its commit while the most-recent
// applied change is a history replay (`isHistoryReplaying()`), so the redo stack
// survives and Cmd+Shift+Z re-applies the edit.
test("Cmd+Shift+Z re-applies the edit", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "history-text-redo" });
  const textId = await addTextViaMenu(page);
  await expect.poll(() => readText(page, textId)).not.toBe("");

  await enterEditTypeExit(page);
  await expect.poll(() => readText(page, textId)).toBe("EDITED");
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => readText(page, textId)).not.toBe("EDITED");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(() => readText(page, textId)).toBe("EDITED");
});
