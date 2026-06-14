// WI-220 / DR-design-032 — numeric gap/padding toolbar + sizing combobox:
//   1. the width sizing control is a COMBOBOX (Select) — open it, pick "내용맞춤"
//      (Hug) → the frame's layout.sizing.width = "hug".
//   2. typing the frame More popover's 간격 input authors gapPx (px-first).
//   3. typing a Padding side input authors paddingPx[side] (px-first).
// The gap/padding inputs are the frame kind section's layout More (upgraded from
// ratio % to px in WI-220), not a separate section.
//
// Bootstraps without networkidle (the sandbox vite never settles).

import { expect, test } from "@playwright/test";

type W = {
  __weaveEditor: { exec: (n: string, i: unknown) => unknown };
  __weaveDoc: { root: { id: string | number; children: N[] } };
  __weaveVm?: { itemSelection: { set: (x: unknown) => void } };
};
type N = {
  id: string | number;
  attrs: { layout?: Record<string, unknown> };
  children: N[];
};

async function bootstrap(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
    window.localStorage.setItem("weave.dev.unlock-flavors", "1");
  });
  await page.goto("/");
  await page.getByTestId("landing-new-design").click();
  await page.getByTestId("new-design-flavor-canvas-board").click();
  await page.getByTestId("new-design-size-16:9").click();
  await page.getByTestId("new-design-create").click();
  await page.waitForURL(/\/design\/[^/]+$/);
  await page.waitForFunction(() => {
    const w = window as unknown as { __weaveEditor?: unknown; __weaveDoc?: unknown };
    return w.__weaveEditor !== undefined && w.__weaveDoc !== undefined;
  });
  await page.locator('[data-design-plane="true"]').first().waitFor();
}

const exec = (page: import("@playwright/test").Page, name: string, input: unknown) =>
  page.evaluate(({ name, input }) => (window as unknown as W).__weaveEditor.exec(name, input), {
    name,
    input,
  });

const allIds = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    const walk = (n: N) => {
      out.push(String(n.id));
      for (const c of n.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return out;
  });

async function addFrame(
  page: import("@playwright/test").Page,
  containerId: string,
  frame: object,
): Promise<string> {
  const before = new Set(await allIds(page));
  await exec(page, "weave.item.add", { kind: "frame", containerId, frame });
  await page.waitForFunction((n) => {
    const ids: string[] = [];
    const walk = (x: N) => {
      ids.push(String(x.id));
      for (const c of x.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return ids.length > n;
  }, before.size);
  const id = (await allIds(page)).find((x) => !before.has(x));
  if (id === undefined) throw new Error("no new id");
  return id;
}

const layoutOf = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((id) => {
    let l: Record<string, unknown> | undefined;
    const walk = (n: N) => {
      if (String(n.id) === id) l = n.attrs.layout;
      for (const c of n.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return l ?? null;
  }, id);

const select = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, id);

async function flexFrameSelected(page: import("@playwright/test").Page): Promise<string> {
  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));
  const F = await addFrame(page, rootId, { x: 0.1, y: 0.2, width: 0.5, height: 0.4, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: { kind: "auto-flex", direction: "row" },
  });
  await addFrame(page, F, { x: 0, y: 0, width: 0.4, height: 1, rotation: 0 });
  await addFrame(page, F, { x: 0.5, y: 0, width: 0.4, height: 1, rotation: 0 });
  await select(page, F);
  await page.locator('[data-testid="frame-sizing-controls"]').first().waitFor();
  return F;
}

test("width sizing is a combobox: open it and pick 내용맞춤 (Hug)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);
  const F = await flexFrameSelected(page);

  await page.locator('[data-testid="frame-sizing-width"]').click();
  await page.locator('[data-testid="frame-sizing-width-option-hug"]').click();

  await page.waitForFunction((id) => {
    let w: string | undefined;
    const walk = (n: N & { attrs: { layout?: { sizing?: { width?: string } } } }) => {
      if (String(n.id) === id) w = n.attrs.layout?.sizing?.width;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return w === "hug";
  }, F);

  const after = (await layoutOf(page, F)) as { sizing?: { width?: string } } | null;
  expect(after?.sizing?.width).toBe("hug");

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("typing a gap value in the frame layout popover authors gapPx (px-first)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);
  const F = await flexFrameSelected(page);

  const before = (await layoutOf(page, F)) as { gapPx?: number } | null;
  expect(before?.gapPx ?? 0).toBe(0);

  // Open the frame's More popover → the "레이아웃" group is open by default → 간격.
  await page.locator('[data-testid="toolbar-more-trigger"]').click();
  const gapInput = page.getByLabel("간격 input");
  await gapInput.waitFor();
  await gapInput.fill("24");
  await gapInput.press("Enter");

  await page.waitForFunction((id) => {
    let g: number | undefined;
    const walk = (n: N & { attrs: { layout?: { gapPx?: number } } }) => {
      if (String(n.id) === id) g = n.attrs.layout?.gapPx;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return typeof g === "number" && g > 0;
  }, F);

  const after = (await layoutOf(page, F)) as { gapPx?: number } | null;
  expect(after?.gapPx, `gapPx=${after?.gapPx}`).toBeCloseTo(24, 0);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("typing a padding value authors paddingPx (px-first, per side)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);
  const F = await flexFrameSelected(page);

  // Open More → expand the (collapsed) "여백" group → the Left padding input.
  await page.locator('[data-testid="toolbar-more-trigger"]').click();
  await page.locator('[data-testid="frame-flex-padding-group-trigger"]').click();
  const padInput = page.getByLabel("Padding left input");
  await padInput.waitFor();
  await padInput.fill("16");
  await padInput.press("Enter");

  await page.waitForFunction((id) => {
    let p: number | undefined;
    const walk = (n: N & { attrs: { layout?: { paddingPx?: { left?: number } } } }) => {
      if (String(n.id) === id) p = n.attrs.layout?.paddingPx?.left;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return typeof p === "number" && p > 0;
  }, F);

  const after = (await layoutOf(page, F)) as { paddingPx?: { left?: number } } | null;
  expect(after?.paddingPx?.left, `paddingPx.left=${after?.paddingPx?.left}`).toBeCloseTo(16, 0);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
