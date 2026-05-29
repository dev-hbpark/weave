// WI-056 — shape gradient fill. Verifies (1) the dedicated
// `weave.shape.setFill` command stores a gradient PaintSpec and the shape
// renders it as an SVG <linearGradient>, (2) Cmd+Z reverts, and (3) the guard
// rejects a non-shape / malformed fill. Runs against the live runtime via the
// dev `__weaveEditor` / `__weaveDoc` globals.

import { expect, type Page, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

async function addRectangle(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveEditor?: { exec: (n: string, i: unknown) => { value?: unknown } };
      __weaveDoc?: { root: { id: unknown } };
    };
    const r = w.__weaveEditor!.exec("weave.item.add", {
      kind: "shape",
      containerId: String(w.__weaveDoc!.root.id),
      frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
    });
    return String(r.value);
  });
  await page.waitForTimeout(120);
  return id;
}

async function setFill(page: Page, itemId: string, fill: unknown): Promise<boolean> {
  const ok = await page.evaluate(
    ({ itemId, fill }) => {
      const w = window as unknown as {
        __weaveEditor?: { exec: (n: string, i: unknown) => { ok?: boolean } };
      };
      const r = w.__weaveEditor!.exec("weave.shape.setFill", { itemId, fill });
      return r.ok !== false;
    },
    { itemId, fill },
  );
  await page.waitForTimeout(120);
  return ok;
}

async function readFillType(page: Page, itemId: string): Promise<string | undefined> {
  return page.evaluate((cid) => {
    type N = { id: unknown; attrs?: { fill?: { type?: string } }; children?: ReadonlyArray<N> };
    const w = window as unknown as { __weaveDoc?: { root: { children: ReadonlyArray<N> } } };
    const find = (nodes: ReadonlyArray<N>): N | undefined => {
      for (const n of nodes) {
        if (String(n.id) === cid) return n;
        const hit = find(n.children ?? []);
        if (hit !== undefined) return hit;
      }
      return undefined;
    };
    return find(w.__weaveDoc?.root.children ?? [])?.attrs?.fill?.type;
  }, itemId);
}

const LINEAR = {
  type: "linear-gradient",
  angle: 90,
  stops: [
    { offset: 0, color: "#ff0000" },
    { offset: 1, color: "#0000ff" },
  ],
};

test("WI-056 — linear-gradient fill stored, rendered as <linearGradient>, and Cmd+Z reverts", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-056-linear" });
  const id = await addRectangle(page);
  await expect.poll(() => readFillType(page, id)).toBe("solid");

  expect(await setFill(page, id, LINEAR)).toBe(true);
  await expect.poll(() => readFillType(page, id)).toBe("linear-gradient");

  // Rendering self-verification: the shape's SVG now contains a linearGradient
  // def with both stop colors.
  await expect
    .poll(async () =>
      page.evaluate(() => document.querySelectorAll("svg linearGradient stop").length),
    )
    .toBeGreaterThanOrEqual(2);

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForTimeout(80);
  await expect.poll(() => readFillType(page, id)).toBe("solid");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForTimeout(80);
  await expect.poll(() => readFillType(page, id)).toBe("linear-gradient");
});

test("WI-056 — radial-gradient fill is accepted and rendered", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-056-radial" });
  const id = await addRectangle(page);
  expect(
    await setFill(page, id, {
      type: "radial-gradient",
      cx: 0.5,
      cy: 0.5,
      stops: [
        { offset: 0, color: "#ffffff" },
        { offset: 1, color: "#000000" },
      ],
    }),
  ).toBe(true);
  await expect.poll(() => readFillType(page, id)).toBe("radial-gradient");
  await expect
    .poll(async () =>
      page.evaluate(() => document.querySelectorAll("svg radialGradient stop").length),
    )
    .toBeGreaterThanOrEqual(2);
});

test("WI-056 — malformed gradient (1 stop) is rejected, fill unchanged", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-056-guard" });
  const id = await addRectangle(page);
  expect(
    await setFill(page, id, {
      type: "linear-gradient",
      angle: 0,
      stops: [{ offset: 0, color: "#ff0000" }],
    }),
  ).toBe(false);
  await expect.poll(() => readFillType(page, id)).toBe("solid");
});
