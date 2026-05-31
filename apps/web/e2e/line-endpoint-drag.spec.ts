// DR-024 — poly vertex/endpoint drags refit the frame to the vertices (the
// rubber-band follows). Endpoints of an open poly additionally scale the whole
// line uniformly about the opposite endpoint. This pins the model end-to-end.
import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function selectedId(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { state: { get: () => unknown } } };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as
      | { kind: "single"; itemId: unknown }
      | undefined;
    return s?.kind === "single" ? String(s.itemId) : "";
  });
}
async function poly(page: Page, id: string): Promise<{
  frame: Record<string, number>;
  points: { x: number; y: number }[];
}> {
  return await page.evaluate((fid) => {
    type Ch = {
      id: unknown;
      attrs: {
        frame?: Record<string, number>;
        points?: { x: number; y: number }[];
        subAttrs?: { points?: { x: number; y: number }[] };
      };
    };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<Ch> } } };
    const it = (w.__weaveDoc?.root.children ?? []).find((c) => String(c.id) === fid);
    // `line` kind stores points on attrs.points; legacy poly on subAttrs.points.
    return {
      frame: it?.attrs.frame ?? {},
      points: it?.attrs.points ?? it?.attrs.subAttrs?.points ?? [],
    };
  }, id);
}

test("endpoint drag moves the end AND the frame follows; points stay normalized", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepareDesign(page, { flavor: "mixed", title: "Endpoint" });

  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("add-line").click();
  await page.getByTestId("add-line-free").click(); // 자유선 (open poly)
  await page.waitForTimeout(250);
  const id = await selectedId(page);

  const before = (await poly(page, id)).frame;
  const ep = page.locator(`[data-selection-handle-item-id="${id}"] [data-testid="poly-vertex-0"]`);
  await expect(ep).toBeVisible();
  const r = await ep.evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { cx: b.left + b.width / 2, cy: b.top + b.height / 2 };
  });

  await page.mouse.move(r.cx, r.cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(r.cx - 30 * i, r.cy - 22 * i);
  await page.mouse.up();
  await page.waitForTimeout(200);

  const after = await poly(page, id);
  // Rubber-band (frame) CHANGED — it followed the endpoint.
  const moved =
    Math.abs((after.frame.x ?? 0) - (before.x ?? 0)) +
    Math.abs((after.frame.y ?? 0) - (before.y ?? 0)) +
    Math.abs((after.frame.width ?? 0) - (before.width ?? 0)) +
    Math.abs((after.frame.height ?? 0) - (before.height ?? 0));
  expect(moved).toBeGreaterThan(0.02);
  // Points re-normalized into [0,1] of the refit frame.
  for (const p of after.points) {
    expect(p.x).toBeGreaterThanOrEqual(-0.001);
    expect(p.x).toBeLessThanOrEqual(1.001);
    expect(p.y).toBeGreaterThanOrEqual(-0.001);
    expect(p.y).toBeLessThanOrEqual(1.001);
  }
});
