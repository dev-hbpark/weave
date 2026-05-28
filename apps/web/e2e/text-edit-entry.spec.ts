// Text edit-entry UX.
//
// Double-clicking a text item — whether or not it is already selected —
// must, in a SINGLE action: enter edit mode, focus the editor, and select
// ALL the text (so the next keystroke replaces it). Previously the user had
// to double-click and then click once more to actually type, and nothing
// was pre-selected.

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

async function clearSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __weaveVm?: { itemSelection: { clear: () => void } } };
    w.__weaveVm?.itemSelection.clear();
  });
}

test("double-click on an UNSELECTED text item enters edit mode with all text selected", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Text-Edit-Unselected" });
  const textId = await addTextViaMenu(page);
  expect(textId).not.toBe("");
  // The seeded default is non-empty so "select all + replace" is observable.
  await expect.poll(() => readText(page, textId)).not.toBe("");

  // Deselect first — the rule must work regardless of prior selection.
  await clearSelection(page);

  // A single double-click: enters edit mode, focuses, selects all.
  await page.getByTestId("text-block").dblclick();
  await page.getByRole("textbox", { name: "Text content" }).waitFor();

  // No extra click / no manual focus: typing immediately REPLACES the whole
  // text (proves focus + select-all both happened on entry).
  await page.keyboard.type("REPLACED");
  await expect.poll(() => readText(page, textId)).toBe("REPLACED");
});

test("double-click on an ALREADY-selected text item also selects all and types", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "Text-Edit-Selected" });
  const textId = await addTextViaMenu(page);
  expect(textId).not.toBe("");
  await expect.poll(() => readText(page, textId)).not.toBe("");
  // addTextViaMenu leaves the item selected — do not clear.

  await page.getByTestId("text-block").dblclick();
  await page.getByRole("textbox", { name: "Text content" }).waitFor();

  await page.keyboard.type("HELLO");
  await expect.poll(() => readText(page, textId)).toBe("HELLO");
});
