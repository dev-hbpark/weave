// WI-070 — Alt+free-moving an OPEN line's endpoint onto its opposite endpoint
// SNAPS them together and, on release, fuses the two ends into ONE vertex and
// closes the path into a filled `poly` shape. Verified in the live runtime:
//   • mid-drag the opposite endpoint shows the will-fuse highlight + the snap
//     guide overlay renders,
//   • on release a ≥4-point line becomes a closed shape with one fewer vertex,
//   • Cmd+Z restores the (snapped-but-open) line, Cmd+Shift+Z re-closes it,
//   • releasing AWAY from the opposite end does not convert,
//   • a 3-point line never offers the snap (fusing would degenerate).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

// Open path; endpoints 0 (top-left) and 3 (bottom-left) start far apart.
const LINE_4 = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const LINE_3 = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
];

async function addLine(
  page: Page,
  points: ReadonlyArray<{ x: number; y: number }>,
): Promise<string> {
  const id = await page.evaluate(
    ({ pts }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
        __weaveDoc?: { root: { id: unknown } };
      };
      const r = w.__weaveEditor!.exec("weave.item.add", {
        kind: "line",
        containerId: String(w.__weaveDoc!.root.id),
        frame: { x: 0.25, y: 0.2, width: 0.5, height: 0.6, rotation: 0 },
        attrsOverride: { points: pts, smooth: false, heads: { start: "none", end: "none" } },
      });
      return String(r.value);
    },
    { pts: points },
  );
  await page.waitForTimeout(120);
  return id;
}

type RootNode = { id: string; kind: string; closed?: boolean; pointCount: number };

async function rootNodes(page: Page): Promise<RootNode[]> {
  return page.evaluate(() => {
    type Pt = { x: number; y: number };
    type N = {
      id: unknown;
      kind: string;
      attrs?: {
        points?: ReadonlyArray<Pt>;
        subAttrs?: { points?: ReadonlyArray<Pt>; closed?: boolean };
      };
    };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
    return (w.__weaveDoc?.root.children ?? []).map((n) => ({
      id: String(n.id),
      kind: n.kind,
      closed: n.attrs?.subAttrs?.closed,
      pointCount: (n.attrs?.points ?? n.attrs?.subAttrs?.points ?? []).length,
    }));
  });
}

async function center(page: Page, testid: string): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId(testid).boundingBox();
  if (box === null) throw new Error(`no bbox for ${testid}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Alt + press `fromTestId` and free-move the cursor onto `target` screen px,
 *  WITHOUT releasing (so mid-drag feedback can be asserted). */
async function altPressMoveTo(
  page: Page,
  fromTestId: string,
  target: { x: number; y: number },
): Promise<void> {
  const from = await center(page, fromTestId);
  await page.keyboard.down("Alt");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.waitForTimeout(30);
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      from.x + ((target.x - from.x) * i) / 6,
      from.y + ((target.y - from.y) * i) / 6,
    );
    await page.waitForTimeout(12);
  }
  // Land exactly on the target so the radial snap (6px) engages.
  await page.mouse.move(target.x, target.y);
  await page.waitForTimeout(40);
}

async function releaseAlt(page: Page): Promise<void> {
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.waitForTimeout(100);
}

test("WI-070 — Alt+drag endpoint onto the opposite end snaps, then fuses + closes into a shape", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-070-snap-close" });
  const lineId = await addLine(page, LINE_4);
  await setSelection(page, [lineId]);
  await expect(page.getByTestId("poly-vertex-0")).toBeVisible();

  const target = await center(page, "poly-vertex-3"); // opposite endpoint
  await altPressMoveTo(page, "poly-vertex-0", target);

  // Mid-drag: the opposite endpoint shows the will-fuse highlight and the snap
  // guide overlay renders.
  await expect(page.getByTestId("poly-vertex-3")).toHaveAttribute("data-snap-target", "true");
  await expect(page.getByTestId("snap-feedback")).toBeVisible();

  await releaseAlt(page);

  // Released on the opposite end → fused (4 → 3 vertices) closed shape, fresh id.
  await expect
    .poll(async () => {
      const ns = await rootNodes(page);
      return ns.length === 1 ? `${ns[0]!.kind}:${ns[0]!.closed}:${ns[0]!.pointCount}` : "?";
    })
    .toBe("shape:true:3");
  const after = await rootNodes(page);
  expect(after[0]!.id).not.toBe(lineId); // fresh id (new-id policy)

  // Feedback cleared after release.
  await expect(page.getByTestId("snap-feedback")).toHaveCount(0);

  // Cmd+Z restores the (still-open) line at its original id; Cmd+Shift+Z re-closes.
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(async () => {
      const ns = await rootNodes(page);
      return ns.length === 1 ? `${ns[0]!.kind}:${ns[0]!.id}` : "?";
    })
    .toBe(`line:${lineId}`);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect
    .poll(async () => {
      const ns = await rootNodes(page);
      return ns.length === 1 ? `${ns[0]!.kind}:${ns[0]!.closed}` : "?";
    })
    .toBe("shape:true");
});

test("WI-070 — releasing AWAY from the opposite endpoint does not convert", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-070-no-snap" });
  const lineId = await addLine(page, LINE_4);
  await setSelection(page, [lineId]);

  const ep0 = await center(page, "poly-vertex-0");
  // Move only a little (well outside the 6px radius of the opposite endpoint).
  await altPressMoveTo(page, "poly-vertex-0", { x: ep0.x + 24, y: ep0.y + 8 });
  await expect(page.getByTestId("poly-vertex-3")).not.toHaveAttribute("data-snap-target", "true");
  await releaseAlt(page);

  const after = await rootNodes(page);
  expect(after).toHaveLength(1);
  expect(after[0]!.kind).toBe("line"); // still a line — no snap, no close
  expect(after[0]!.pointCount).toBe(4);
});

test("WI-070 — a 3-point line never offers endpoint snap (fuse would degenerate)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-070-3pt" });
  const lineId = await addLine(page, LINE_3);
  await setSelection(page, [lineId]);

  const target = await center(page, "poly-vertex-2"); // opposite endpoint
  await altPressMoveTo(page, "poly-vertex-0", target);
  // Eligibility requires ≥4 points → no snap target, no overlay.
  await expect(page.getByTestId("poly-vertex-2")).not.toHaveAttribute("data-snap-target", "true");
  await expect(page.getByTestId("snap-feedback")).toHaveCount(0);
  await releaseAlt(page);

  const after = await rootNodes(page);
  expect(after[0]!.kind).toBe("line"); // unchanged
});
