// WI-041 Phase 6 — Paste Special dialog (DR-019 D6).
//
// Three e2e fixtures:
//   1. "Style only" — source shape with a distinctive color is copied,
//      a second (different-colored) shape is selected, Paste Special →
//      "스타일만" applies the source's color while keeping the target's
//      position and size.
//   2. "Size only" — source shape's width/height are projected onto a
//      target shape; the target's position is preserved.
//
// `Position only` and `Text only` follow the same mechanical pattern as
// `Size only`; the two specs below exercise the registry path (Rule 6)
// so the remaining two are covered by the unit-level paste handler
// tests as we add them.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

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

async function readAttrs(page: Page, id: string): Promise<Record<string, unknown>> {
  return page.evaluate((targetId) => {
    interface Node {
      readonly id: unknown;
      readonly attrs: Readonly<Record<string, unknown>>;
      readonly children: ReadonlyArray<Node>;
    }
    type Doc = { root: Node };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return {};
    function find(n: Node): Node | null {
      if (String(n.id) === targetId) return n;
      for (const c of n.children) {
        const r = find(c);
        if (r !== null) return r;
      }
      return null;
    }
    const node = find(doc.root);
    return (node?.attrs ?? {}) as Record<string, unknown>;
  }, id);
}

async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((fid) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
    };
    w.__weaveVm?.itemSelection.set(fid);
  }, id);
}

async function patchAttrs(page: Page, id: string, next: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ fid, attrs }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => unknown };
      };
      w.__weaveEditor?.exec("weave.item.update", {
        itemId: fid,
        patch: (prev: { attrs: Readonly<Record<string, unknown>> }) => ({
          attrs: { ...prev.attrs, ...attrs },
        }),
      });
    },
    { fid: id, attrs: next },
  );
}

test("Paste Special — Style only: source color overwrites target color, frame intact", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-041-ps-style" });

  // Source shape at (0.1, 0.1, 0.2x0.2) with color="purple".
  await addFrame(page, "shape", {
    frame: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
  });
  const sourceId = await lastChildId(page);
  await patchAttrs(page, sourceId, { color: "purple" });

  // Target shape at (0.6, 0.6, 0.3x0.15) with color="green".
  await addFrame(page, "shape", {
    frame: { x: 0.6, y: 0.6, width: 0.3, height: 0.15, rotation: 0 },
  });
  const targetId = await lastChildId(page);
  await patchAttrs(page, targetId, { color: "green" });

  // Copy the source, then select the target.
  await select(page, sourceId);
  await page.keyboard.press("ControlOrMeta+C");
  await select(page, targetId);

  // Open Paste Special, pick "스타일만", confirm.
  await page.keyboard.press("ControlOrMeta+Alt+V");
  await page.getByTestId("paste-special-dialog").waitFor();
  await page.getByTestId("paste-special-mode-style").click();
  await page.getByTestId("paste-special-confirm").click();
  await page.waitForTimeout(80);

  const after = await readAttrs(page, targetId);
  expect(after.color).toBe("purple");
  // Frame is unchanged — Style only does NOT touch size or position.
  const targetFrame = after.frame as { x: number; y: number; width: number; height: number };
  expect(targetFrame.x).toBeCloseTo(0.6, 5);
  expect(targetFrame.y).toBeCloseTo(0.6, 5);
  expect(targetFrame.width).toBeCloseTo(0.3, 5);
  expect(targetFrame.height).toBeCloseTo(0.15, 5);
});

test("Paste Special — Size only: source width/height overwrites target, position intact", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-041-ps-size" });

  await addFrame(page, "shape", {
    frame: { x: 0.05, y: 0.05, width: 0.4, height: 0.5, rotation: 0 },
  });
  const sourceId = await lastChildId(page);

  await addFrame(page, "shape", {
    frame: { x: 0.7, y: 0.7, width: 0.1, height: 0.1, rotation: 0 },
  });
  const targetId = await lastChildId(page);

  await select(page, sourceId);
  await page.keyboard.press("ControlOrMeta+C");
  await select(page, targetId);

  await page.keyboard.press("ControlOrMeta+Alt+V");
  await page.getByTestId("paste-special-dialog").waitFor();
  await page.getByTestId("paste-special-mode-size").click();
  await page.getByTestId("paste-special-confirm").click();
  await page.waitForTimeout(80);

  const after = await readAttrs(page, targetId);
  const frame = after.frame as { x: number; y: number; width: number; height: number };
  // Size overwritten by source.
  expect(frame.width).toBeCloseTo(0.4, 5);
  expect(frame.height).toBeCloseTo(0.5, 5);
  // Position preserved from the target.
  expect(frame.x).toBeCloseTo(0.7, 5);
  expect(frame.y).toBeCloseTo(0.7, 5);
});
