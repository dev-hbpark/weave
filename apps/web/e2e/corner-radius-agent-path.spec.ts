// WI-109 follow-up — the Aku agent edits corner radius through the SAME command
// the handle uses (`weave.item.update` with an `attrs` object). This proves the
// agent path is connected in the absolute-px model: a uniform px value and a
// per-corner `borderRadii` four-tuple both land on the rendered element's CSS
// border-radius (NOT the legacy 0..1 ratio, which would round to ~0px).

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers";

/** Run an agent-style edit: `editor.exec("weave.item.update", { itemId, attrs })`. */
async function agentUpdate(
  page: Page,
  itemId: string,
  attrs: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(
    ({ itemId, attrs }) => {
      const editor = (
        window as unknown as { __weaveEditor: { exec: (n: string, i: unknown) => unknown } }
      ).__weaveEditor;
      editor.exec("weave.item.update", { itemId, attrs });
    },
    { itemId, attrs },
  );
}

/** Computed border-radius of the image block's wrapper (the element ImageBlock
 *  applies the radius to). */
async function imageBorderRadius(page: Page, itemId: string): Promise<string> {
  return page.evaluate((id) => {
    const frame = document.querySelector(`[data-frame-id="${CSS.escape(id)}"]`);
    if (frame === null) return "";
    // ImageBlock applies the radius as an INLINE style on its wrapper div —
    // placeholder/icon rounding comes from CSS classes, so look for the inline
    // value specifically (ignores `rounded-*` utility classes).
    const all = [frame, ...Array.from(frame.querySelectorAll("*"))] as HTMLElement[];
    for (const el of all) {
      const br = el.style.borderRadius;
      // ImageBlock writes a px value (uniform "Npx" or 4-value); skip unrelated
      // inline radii that use CSS-var tokens (e.g. placeholder var(--radius-md)).
      if (br && br.includes("px")) return br;
    }
    return "0px";
  }, itemId);
}

test.describe("corner radius — Aku agent path", () => {
  test.beforeEach(async ({ page }) => {
    await clearAllDesigns(page);
  });

  test("agent weave.item.update applies uniform px and per-corner borderRadii to an image", async ({
    page,
  }) => {
    await prepareDesign(page);
    await addFrame(page, "image", {
      frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.3, rotation: 0 },
    });
    const id = await page.evaluate(() => {
      const root = (window as unknown as { __weaveDoc: { root: { children: { id: unknown }[] } } })
        .__weaveDoc.root;
      return String(root.children[root.children.length - 1]!.id);
    });

    // Uniform px (agent sends a plain number — now design-px, not a 0..1 ratio).
    await agentUpdate(page, id, { borderRadius: 40 });
    await expect.poll(async () => imageBorderRadius(page, id)).toBe("40px");

    // Per-corner four-tuple (agent can round each corner independently).
    await agentUpdate(page, id, { borderRadii: { tl: 30, tr: 10, br: 5, bl: 0 } });
    await expect.poll(async () => imageBorderRadius(page, id)).toBe("30px 10px 5px 0px");
  });
});
