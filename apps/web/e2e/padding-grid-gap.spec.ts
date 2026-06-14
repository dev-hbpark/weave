// WI-219 / DR-139 — live proof of the on-canvas PADDING + GRID-GAP authoring
// handles:
//   1. dragging a flex frame's padding edge authors paddingPx[side] (px-first).
//   2. dragging a grid gap grip authors columnGapPx (uniform, px-first).
//   3. (regression) the grid track-boundary LINE still resizes tracks, NOT the
//      gap — the two affordances stay separate (DR-design-031).
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

test("dragging a flex padding edge authors paddingPx (px-first)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));
  const F = await addFrame(page, rootId, { x: 0.1, y: 0.2, width: 0.5, height: 0.4, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    // start with a small padding so the left edge is clearly inside + grabbable.
    layout: {
      kind: "auto-flex",
      direction: "row",
      padding: { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
    },
  });
  await addFrame(page, F, { x: 0, y: 0, width: 0.4, height: 1, rotation: 0 });
  await addFrame(page, F, { x: 0.5, y: 0, width: 0.4, height: 1, rotation: 0 });
  await select(page, F);

  // No px padding authored yet.
  const before = (await layoutOf(page, F)) as { paddingPx?: { left?: number } } | null;
  expect(before?.paddingPx?.left ?? 0).toBe(0);

  const edge = page.getByTestId("layout-pad-left");
  await expect.poll(() => edge.count()).toBeGreaterThan(0);
  const box = await edge.boundingBox();
  if (box === null) throw new Error("no padding edge");

  // Drag the left padding edge RIGHT → left padding widens.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 10 });
  await page.mouse.up();

  await page.waitForFunction((id) => {
    let lp: number | undefined;
    const walk = (n: N & { attrs: { layout?: { paddingPx?: { left?: number } } } }) => {
      if (String(n.id) === id) lp = n.attrs.layout?.paddingPx?.left;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return typeof lp === "number" && lp > 0;
  }, F);

  const after = (await layoutOf(page, F)) as { paddingPx?: { left?: number } } | null;
  expect(after?.paddingPx?.left ?? 0, `paddingPx.left=${after?.paddingPx?.left}`).toBeGreaterThan(
    0,
  );

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("dragging a grid gap grip authors columnGapPx (uniform, px-first)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));
  const F = await addFrame(page, rootId, { x: 0.1, y: 0.2, width: 0.6, height: 0.4, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: {
      kind: "auto-grid",
      columns: [
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
      ],
      rows: [{ kind: "fr", value: 1 }],
      columnGap: 0,
      rowGap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  });
  await addFrame(page, F, { x: 0, y: 0, width: 0.4, height: 1, rotation: 0 });
  await addFrame(page, F, { x: 0.5, y: 0, width: 0.4, height: 1, rotation: 0 });
  await select(page, F);

  const before = (await layoutOf(page, F)) as { columnGapPx?: number } | null;
  expect(before?.columnGapPx ?? 0).toBe(0);

  const grip = page.getByTestId("layout-gap-column-0");
  await expect.poll(() => grip.count()).toBeGreaterThan(0);
  const box = await grip.boundingBox();
  if (box === null) throw new Error("no gap grip");

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy, { steps: 10 });
  await page.mouse.up();

  await page.waitForFunction((id) => {
    let g: number | undefined;
    const walk = (n: N & { attrs: { layout?: { columnGapPx?: number } } }) => {
      if (String(n.id) === id) g = n.attrs.layout?.columnGapPx;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return typeof g === "number" && g > 0;
  }, F);

  const after = (await layoutOf(page, F)) as { columnGapPx?: number } | null;
  expect(after?.columnGapPx ?? 0, `columnGapPx=${after?.columnGapPx}`).toBeGreaterThan(0);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("regression: grid track-boundary LINE still resizes tracks, not the gap", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));
  const F = await addFrame(page, rootId, { x: 0.1, y: 0.2, width: 0.6, height: 0.4, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: {
      kind: "auto-grid",
      columns: [
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
      ],
      rows: [{ kind: "fr", value: 1 }],
      columnGap: 0,
      rowGap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  });
  await addFrame(page, F, { x: 0, y: 0, width: 0.4, height: 1, rotation: 0 });
  await addFrame(page, F, { x: 0.5, y: 0, width: 0.4, height: 1, rotation: 0 });
  await select(page, F);

  const line = page.getByTestId("layout-line-grid-col-0");
  await expect.poll(() => line.count()).toBeGreaterThan(0);
  const box = await line.boundingBox();
  if (box === null) throw new Error("no track line");

  // Drag the TRACK line right → the first column grows (track resize). Grab the
  // line off-centre (away from the gap grip) so the line — not the grip — wins.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 50, cy, { steps: 10 });
  await page.mouse.up();

  await page.waitForFunction((id) => {
    let cols: Array<{ kind: string; value?: number }> | undefined;
    const walk = (n: N & { attrs: { layout?: { columns?: Array<{ kind: string }> } } }) => {
      if (String(n.id) === id)
        cols = n.attrs.layout?.columns as Array<{ kind: string; value?: number }> | undefined;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    // track resize converts the pair to explicit ratio tracks with unequal sizes.
    return (
      cols !== undefined && cols[0]?.kind === "ratio" && (cols[0]?.value ?? 0) > 0.5 // first column grew past half
    );
  }, F);

  const after = (await layoutOf(page, F)) as { columnGapPx?: number } | null;
  // The track drag must NOT have authored a gap.
  expect(after?.columnGapPx ?? 0, "track drag must not author a gap").toBe(0);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
