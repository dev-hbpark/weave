// Font-size kind fix (WI-135 / DR-086) — reparenting a text into a
// DIFFERENT-height parent keeps its on-screen size for BOTH kinds. A
// `fontSizeSpec.kind:'ratio'` resolves to value × parentHeight; the
// `weave.item.reparent` command now re-bases that value in the same transaction
// so the rendered px is preserved (px fonts + the box were already preserved).
// The fix lives IN the command, so the raw exec (Aku agent / programmatic) path
// is covered too. Reparent A(height 0.25) → B(height 0.5).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function rootFrameId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    return String(w.__weaveDoc?.root.children?.[0]?.id ?? "");
  });
}

async function addFrame(page: Page, parent: string, h: number): Promise<string> {
  const id = await page.evaluate(
    ({ p, h }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      };
      return String(
        w.__weaveEditor!.exec("weave.item.add", {
          kind: "frame",
          containerId: p,
          frame: { x: 0.05, y: 0.05, width: 0.4, height: h, rotation: 0 },
          attrsOverride: { presentable: false },
        }).value,
      );
    },
    { p: parent, h },
  );
  await page.waitForTimeout(120);
  return id;
}

async function addText(page: Page, parent: string, text: string, spec: unknown): Promise<string> {
  const id = await page.evaluate(
    ({ p, text, spec }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      };
      return String(
        w.__weaveEditor!.exec("weave.item.add", {
          kind: "text",
          containerId: p,
          frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.3, rotation: 0 },
          attrsOverride: { text, fontSizeSpec: spec },
        }).value,
      );
    },
    { p: parent, text, spec },
  );
  await page.waitForTimeout(120);
  return id;
}

/** The RAW `weave.item.reparent` command — the same path the Aku agent tool and
 *  any programmatic caller use. Ratio-font preservation is built INTO the command
 *  now (WI-135 / DR-086), so this is the path under test. */
async function reparent(page: Page, itemId: string, newParentId: string): Promise<void> {
  await page.evaluate(
    ({ itemId, newParentId }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor!.exec("weave.item.reparent", { entries: [{ itemId, newParentId }] });
    },
    { itemId, newParentId },
  );
  await page.waitForTimeout(150);
}

/** Rendered font-size (design-px) of the text-block whose content matches.
 *  fontSize is applied on an inner element, so take the MAX computed font-size
 *  across the matching block's subtree (the resolvedFontSizePx the renderer set). */
async function renderedFontPx(page: Page, content: string): Promise<number | null> {
  return page.evaluate((c) => {
    const blocks = Array.from(document.querySelectorAll('[data-testid="text-block"]'));
    const el = blocks.find((b) => (b.textContent ?? "").includes(c)) as HTMLElement | undefined;
    if (!el) return null;
    let max = 0;
    for (const node of [el, ...Array.from(el.querySelectorAll("*"))]) {
      const fs = Number.parseFloat(getComputedStyle(node as HTMLElement).fontSize);
      if (Number.isFinite(fs)) max = Math.max(max, fs);
    }
    return max;
  }, content);
}

/** The doc item's stored fontSizeSpec + parent id (to prove value is unchanged). */
async function itemInfo(page: Page, id: string): Promise<{ spec: unknown; parent: string } | null> {
  return page.evaluate((cid) => {
    type N = { id: unknown; attrs?: { fontSizeSpec?: unknown }; children?: ReadonlyArray<N> };
    const w = window as unknown as { __weaveDoc?: { root: N } };
    const root = w.__weaveDoc?.root;
    if (!root) return null;
    const walk = (n: N): { spec: unknown; parent: string } | null => {
      for (const c of n.children ?? []) {
        // `n` directly contains `c`, so `n.id` is `c`'s parent.
        if (String(c.id) === cid) return { spec: c.attrs?.fontSizeSpec, parent: String(n.id) };
        const hit = walk(c);
        if (hit) return hit;
      }
      return null;
    };
    return walk(root);
  }, id);
}

test("reparent gesture into a taller frame preserves BOTH ratio + px font sizes", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "fontsize-reparent" });
  const slide = await rootFrameId(page);
  const a = await addFrame(page, slide, 0.25);
  const b = await addFrame(page, slide, 0.5); // 2× the height of A

  const ratioText = await addText(page, a, "RATIOZZ", { kind: "ratio", value: 0.2 });
  const pxText = await addText(page, a, "PXTEXTZZ", { kind: "px", value: 30 });

  const ratioBefore = await renderedFontPx(page, "RATIOZZ");
  const pxBefore = await renderedFontPx(page, "PXTEXTZZ");
  expect(ratioBefore, "ratio text rendered").not.toBeNull();

  // Move both through the real gesture path (ratio-font-preserving).
  await reparent(page, ratioText, b);
  await reparent(page, pxText, b);

  const ratioAfter = await renderedFontPx(page, "RATIOZZ");
  const pxAfter = await renderedFontPx(page, "PXTEXTZZ");
  const ratioInfo = await itemInfo(page, ratioText);
  // eslint-disable-next-line no-console
  console.log("[fontsize-reparent fixed]", {
    ratioBefore,
    ratioAfter,
    pxBefore,
    pxAfter,
    ratioSpecAfter: ratioInfo?.spec,
  });

  // Both kinds keep their on-screen size — the command's "preserve position"
  // contract now holds for ratio too (value halved: 0.2 → 0.1 against the 2×
  // parent), so the rendered px is unchanged.
  expect(ratioAfter!, "ratio font preserved on the gesture path").toBeCloseTo(ratioBefore!, 0);
  expect(pxAfter!, "px font preserved").toBeCloseTo(pxBefore!, 0);
  // Still a ratio spec, just re-based so the px is stable.
  expect((ratioInfo?.spec as { kind?: string })?.kind).toBe("ratio");
});

test("one Cmd+Z restores BOTH the reparent and the ratio-font re-base (single transaction)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck", title: "fontsize-reparent-undo" });
  const slide = await rootFrameId(page);
  const a = await addFrame(page, slide, 0.25);
  const b = await addFrame(page, slide, 0.5);
  const ratioText = await addText(page, a, "UNDOZZ", { kind: "ratio", value: 0.2 });

  const before = await renderedFontPx(page, "UNDOZZ");
  const parentBefore = (await itemInfo(page, ratioText))?.parent;

  await reparent(page, ratioText, b);
  expect((await itemInfo(page, ratioText))?.parent).toBe(b);
  expect((await itemInfo(page, ratioText))?.spec).toMatchObject({ kind: "ratio", value: 0.1 });

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(150);

  // A single undo puts the item back in A AND restores value 0.2 (rendered px
  // identical) — the reparent + font-update were one runBatch transaction.
  const info = await itemInfo(page, ratioText);
  expect(info?.parent, "item back in A after one undo").toBe(parentBefore);
  expect(info?.spec, "ratio value restored after one undo").toMatchObject({
    kind: "ratio",
    value: 0.2,
  });
  expect(await renderedFontPx(page, "UNDOZZ")).toBeCloseTo(before!, 0);
});

test("the AGENT / programmatic path (raw weave.item.reparent) also preserves the ratio font", async ({
  page,
}) => {
  // The Aku agent + any programmatic caller exec the raw command directly. The
  // fix lives IN the command, so this path is preserved too (WI-135 follow-up).
  await prepareDesign(page, { flavor: "slide-deck", title: "fontsize-reparent-raw" });
  const slide = await rootFrameId(page);
  const a = await addFrame(page, slide, 0.25);
  const b = await addFrame(page, slide, 0.5);
  const ratioText = await addText(page, a, "RAWRATIO", { kind: "ratio", value: 0.2 });
  const before = await renderedFontPx(page, "RAWRATIO");
  await reparent(page, ratioText, b); // raw exec
  const after = await renderedFontPx(page, "RAWRATIO");
  expect(after!, "raw command now preserves the ratio font").toBeCloseTo(before!, 0);
  expect((await itemInfo(page, ratioText))?.spec).toMatchObject({ kind: "ratio", value: 0.1 });
});
