// WI-146 follow-up — repro for the agent-slide bug: a text inside an auto-flex
// COLUMN, created with a LARGE explicit height, should auto-fit to its CONTENT
// height on load (not stay tall until the user edits it). Measures the rendered
// DOM height of the text item's element.
import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

// item.add stages the creation asynchronously (ChangeStream → React state), so
// each dependent step must be its OWN evaluate with a settle in between (a later
// exec can't reference an item added in the same evaluate — container-not-found).
async function buildFlexColumnWithTallText(page: Page): Promise<{ f: string; t1: string }> {
  const ex = (name: string, input: unknown) =>
    page.evaluate(
      ({ n, i }) => {
        const w = window as unknown as {
          __weaveEditor: { exec: (n: string, i: unknown) => { value?: unknown } };
        };
        const r = w.__weaveEditor.exec(n, i);
        return String(r.value);
      },
      { n: name, i: input },
    );
  const root = await page.evaluate(() =>
    String((window as unknown as { __weaveDoc: { root: { id: unknown } } }).__weaveDoc.root.id),
  );
  const f = await ex("weave.item.add", {
    kind: "frame",
    containerId: root,
    frame: { x: 0.5, y: 0.1, width: 0.4, height: 0.8, rotation: 0 },
  });
  await page.waitForTimeout(150);
  // Two SHORT texts with a deliberately TALL height (0.4 of the frame each).
  const t1 = await ex("weave.item.add", {
    kind: "text",
    containerId: f,
    frame: { x: 0, y: 0, width: 1, height: 0.4, rotation: 0 },
    attrsOverride: { text: "Row one" },
  });
  await page.waitForTimeout(150);
  await ex("weave.item.add", {
    kind: "text",
    containerId: f,
    frame: { x: 0, y: 0.5, width: 1, height: 0.4, rotation: 0 },
    attrsOverride: { text: "Row two" },
  });
  await page.waitForTimeout(150);
  // Make the frame an auto-flex column (mirrors agent: add children → setLayout).
  await ex("weave.frame.setLayout", {
    itemId: f,
    layout: {
      kind: "auto-flex",
      direction: "column",
      gap: 0.02,
      justify: "start",
      align: "stretch",
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  });
  return { f, t1 };
}

/** Stored frame.height (ratio of parent) of an item, read from the live doc. */
async function docFrameH(page: Page, id: string): Promise<number> {
  return page.evaluate((itemId) => {
    const w = window as unknown as { __weaveDoc?: { root: unknown } };
    const root = w.__weaveDoc?.root;
    if (root === undefined) return -1;
    type Node = { id: unknown; attrs?: { frame?: { height?: number } }; children?: Node[] };
    const find = (it: Node): Node | null => {
      if (String(it.id) === itemId) return it;
      for (const c of it.children ?? []) {
        const r = find(c);
        if (r) return r;
      }
      return null;
    };
    const node = find(root as Node);
    return node?.attrs?.frame?.height ?? -1;
  }, id);
}

test("WI-146 — tall text in a flex column auto-fits to content height on load (no edit)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-146-flex-text" });
  const { t1 } = await buildFlexColumnWithTallText(page);
  await page.waitForTimeout(800); // let layout + auto-height settle

  // Created at height 0.4 of the frame; a one-line text auto-fit should be much
  // smaller. If auto-height did NOT run on load, it stays ~0.4 (the bug).
  const h = await docFrameH(page, t1);
  expect(h).toBeGreaterThan(0);
  expect(h, `text frame.height after load+settle = ${h} (created at 0.4)`).toBeLessThan(0.2);
});
