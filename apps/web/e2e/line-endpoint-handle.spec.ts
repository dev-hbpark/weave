// WI-066 — open-line ENDPOINT handles:
//   • render as SQUARES (interior vertices stay round),
//   • drag = stretch-keeping-shape (similarity about the opposite end),
//   • Alt/Option + drag = free-move that single point like an interior vertex.
// Verified in the live runtime via on-screen handle positions (refit-invariant).

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

const OPEN_LINE = [
  { x: 0, y: 0.5 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
];

async function addLine(page: Page): Promise<string> {
  const id = await page.evaluate(
    ({ points }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
        __weaveDoc?: { root: { id: unknown } };
      };
      const r = w.__weaveEditor!.exec("weave.item.add", {
        kind: "line",
        containerId: String(w.__weaveDoc!.root.id),
        frame: { x: 0.25, y: 0.25, width: 0.5, height: 0.5, rotation: 0 },
        attrsOverride: { points, smooth: false, heads: { start: "none", end: "none" } },
      });
      return String(r.value);
    },
    { points: OPEN_LINE },
  );
  await page.waitForTimeout(120);
  return id;
}

async function centerX(page: Page, testid: string): Promise<number> {
  const box = await page.getByTestId(testid).boundingBox();
  if (box === null) throw new Error(`no bbox for ${testid}`);
  return box.x + box.width / 2;
}

async function dragHandle(
  page: Page,
  testid: string,
  dx: number,
  dy: number,
  withAlt: boolean,
): Promise<void> {
  const box = await page.getByTestId(testid).boundingBox();
  if (box === null) throw new Error("no handle bbox");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (withAlt) await page.keyboard.down("Alt");
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(30);
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(cx + (dx * i) / 6, cy + (dy * i) / 6);
    await page.waitForTimeout(10);
  }
  await page.mouse.up();
  if (withAlt) await page.keyboard.up("Alt");
  await page.waitForTimeout(80);
}

test("WI-066 — endpoints are square handles; Alt+drag frees the point, plain drag stretches", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-066-endpoint" });
  const id = await addLine(page);
  await setSelection(page, [id]);

  const ep = page.getByTestId("poly-vertex-0"); // left endpoint
  await expect(ep).toBeVisible();
  // Default (stretch) → square handle, marked as an endpoint.
  await expect(ep).toHaveAttribute("data-handle-role", "endpoint");
  await expect(ep).toHaveAttribute("data-handle-mode", "stretch");
  expect(await ep.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("2px");
  // The interior vertex stays round.
  await expect(page.getByTestId("poly-vertex-1")).toHaveAttribute("data-handle-role", "vertex");

  // Shape toggles LIVE with the modifier (no drag): Alt held → free-move look
  // (round); released → back to stretch (square).
  await page.keyboard.down("Alt");
  await expect(ep).toHaveAttribute("data-handle-mode", "free");
  expect(await ep.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe("2px");
  await page.keyboard.up("Alt");
  await expect(ep).toHaveAttribute("data-handle-mode", "stretch");
  expect(await ep.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("2px");

  // Alt + drag the endpoint left: free-move → the middle vertex's screen
  // position is preserved (only the dragged point moves).
  const midBefore = await centerX(page, "poly-vertex-1");
  await dragHandle(page, "poly-vertex-0", -80, 0, true);
  const midAfterAlt = await centerX(page, "poly-vertex-1");
  expect(Math.abs(midAfterAlt - midBefore)).toBeLessThan(4);

  // Undo the Alt drag, then plain drag the endpoint the same way: similarity
  // transform scales the whole line about the far end → the middle vertex moves.
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  await expect.poll(() => centerX(page, "poly-vertex-1")).toBeCloseTo(midBefore, 0);

  await dragHandle(page, "poly-vertex-0", -80, 0, false);
  const midAfterPlain = await centerX(page, "poly-vertex-1");
  expect(Math.abs(midAfterPlain - midBefore)).toBeGreaterThan(4);
});
