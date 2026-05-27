// WI-041 Phase 4 — frame deep copy + cross-tab BroadcastChannel + MAX_PASTE_NODES.
//
// 1. Frame deep copy — a frame with N children round-trips through the
//    clipboard so every descendant gets a fresh id and the structure
//    survives.
// 2. Cross-tab paste — copy in tab A, paste in tab B (same browser
//    context, same origin). BroadcastChannel publishes the payload and
//    the second tab's store receives it.
// 3. MAX_PASTE_NODES — a frame with >500 nodes is refused at copy
//    time; the clipboard stays empty so a subsequent paste is a no-op.

import { type BrowserContext, expect, type Page, test } from "@playwright/test";
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

async function rootChildCount(page: Page): Promise<number> {
  return (await rootChildIds(page)).length;
}

async function readDescendantIds(page: Page, rootId: string): Promise<string[]> {
  return page.evaluate((targetId) => {
    interface Node {
      readonly id: unknown;
      readonly children: ReadonlyArray<Node>;
    }
    type Doc = { root: Node };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return [];
    function find(n: Node): Node | null {
      if (String(n.id) === targetId) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== null) return r;
      }
      return null;
    }
    function collect(n: Node, out: string[]): void {
      for (const c of n.children) {
        out.push(String(c.id));
        collect(c, out);
      }
    }
    const root = find(doc.root);
    if (root === null) return [];
    const out: string[] = [];
    collect(root, out);
    return out;
  }, rootId);
}

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
}

async function lastChildId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    if (last === undefined) throw new Error("lastChildId: empty doc");
    return String(last.id);
  });
}

test("Frame with 5 children deep-copies: paste produces a new id for every descendant", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-041-deep-copy" });

  // Add a parent frame.
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.6, height: 0.6, rotation: 0 },
  });
  const parentId = await lastChildId(page);

  // Add 5 children inside it.
  for (let i = 0; i < 5; i++) {
    await addFrame(page, "shape", {
      containerId: parentId,
      frame: {
        x: 0.1 + i * 0.1,
        y: 0.1,
        width: 0.1,
        height: 0.1,
        rotation: 0,
      },
    });
  }
  const originalDescendants = await readDescendantIds(page, parentId);
  expect(originalDescendants).toHaveLength(5);

  // Copy the parent frame.
  await select(page, parentId);
  await page.keyboard.press("ControlOrMeta+C");
  await page.keyboard.press("ControlOrMeta+V");

  // A new root sibling has appeared.
  await expect.poll(() => rootChildCount(page)).toBe(2);
  const ids = await rootChildIds(page);
  const newRoot = ids[ids.length - 1]!;
  expect(newRoot).not.toBe(parentId);

  // Every descendant must be a fresh id (no collision with the source).
  const newDescendants = await readDescendantIds(page, newRoot);
  expect(newDescendants).toHaveLength(5);
  for (const newId of newDescendants) {
    expect(originalDescendants).not.toContain(newId);
  }
});

test("Cross-tab: copy in tab A propagates to tab B's clipboard store", async ({
  browser,
}) => {
  const context: BrowserContext = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  // Both tabs prepare the SAME design id so they share storage state.
  await pageA.addInitScript(() => {
    // Ensure both tabs treat the design id the same way.
    window.localStorage.removeItem("weave.clipboard.v1");
  });

  await clearAllDesigns(pageA);
  await prepareDesign(pageA, { flavor: "mixed", title: "WI-041-crosstab" });
  await addFrame(pageA, "shape", {
    frame: { x: 0.3, y: 0.3, width: 0.2, height: 0.2, rotation: 0 },
  });
  const sourceId = await lastChildId(pageA);

  // Open tab B on a fresh design — the cross-tab transport works at the
  // origin level, not the design level, so a copy in A still flips B's
  // `clipboardHasItems` state.
  await prepareDesign(pageB, { flavor: "mixed", title: "WI-041-crosstab-B" });

  // Copy in tab A.
  await select(pageA, sourceId);
  await pageA.keyboard.press("ControlOrMeta+C");

  // Tab B's clipboardStore should receive the payload through either
  // BroadcastChannel (Chromium default) or localStorage (Safari Private
  // fallback). We poll the store directly via the dev shim — the
  // command-context flag also flips, but reaching that requires the
  // React render to settle, which is racier in cross-tab tests.
  await expect
    .poll(
      async () =>
        pageB.evaluate(() => {
          // Re-import-by-side-effect: the store module is already loaded
          // because DesignPage mounted the transports on first paint.
          // We read via the same dev shim the e2e helpers use.
          const w = window as unknown as {
            __weaveClipboardPeek?: () => unknown;
          };
          return w.__weaveClipboardPeek !== undefined
            ? w.__weaveClipboardPeek() !== undefined
            : null;
        }),
      { timeout: 4000 },
    )
    .toBe(true);

  await pageB.close();
  await pageA.close();
  await context.close();
});

test.skip(
  "MAX_PASTE_NODES — copying a frame above the cap is refused; clipboard stays empty",
  async () => {
    // Inflating a tree to 501 nodes through the real `weave.item.add`
    // pipeline (the only path that lets the e2e harness shape a doc)
    // is too slow to fit inside Playwright's 30s test timeout. The cap
    // logic is small and deterministic, so the same property is
    // covered at the unit level by `clipboard-cap.test.ts` — see the
    // `countSubtreeNodes` cases there. Skipping here keeps the e2e
    // suite responsive while preserving the documentation trail of
    // the user-visible behaviour.
  },
);
