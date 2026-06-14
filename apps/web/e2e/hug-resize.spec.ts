// WI-042 / DR-055 / FR-011 P3 — live proof that a Hug frame grows EXACTLY to fit
// when a child inside it is resized (option A: resize writes the child's px
// sizePx; the engine reflows the Hug ancestor up). Passing design dims anchors
// the root to its exact hug size (F width = child px ÷ design width) — bootstrapped
// on the FIRST resize, not just proportionally.
//
//   Test 1 drives the COMMAND directly (weave.frame.setSizing + weave.item.resizeHug)
//   — the deterministic exact-hug assertion.
//   Test 2 drives the REAL resize-HANDLE drag (DesignPage.onCommitFrame's Hug
//   branch converts the gesture's parent-relative ratio → child px and bakes the
//   Hug growth). This proves the mouse pipeline, not just the command.
//
// Bootstraps without networkidle (the sandbox vite never settles).

import { expect, test } from "@playwright/test";

type W = {
  __weaveEditor: { exec: (n: string, i: unknown) => unknown };
  __weaveDoc: { root: { id: string | number; children: N[] } };
  __weaveVm?: { itemSelection: { set: (x: unknown) => void; clear: () => void } };
};
type N = {
  id: string | number;
  attrs: { frame?: { width: number; height: number }; layoutChild?: { sizePx?: { w: number } } };
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
    const w = window as unknown as {
      __weaveEditor?: unknown;
      __weaveDoc?: unknown;
      __weaveVm?: unknown;
    };
    return w.__weaveEditor !== undefined && w.__weaveDoc !== undefined && w.__weaveVm !== undefined;
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

const findFrame = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((id) => {
    let f: { width: number; height: number } | undefined;
    let sp: number | undefined;
    const walk = (n: N) => {
      if (String(n.id) === id) {
        f = n.attrs.frame;
        sp = n.attrs.layoutChild?.sizePx?.w;
      }
      for (const c of n.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return { width: f?.width, sizePxW: sp };
  }, id);

/** exec an add, return the new id once the doc reflects it. */
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
  const after = await allIds(page);
  const id = after.find((x) => !before.has(x));
  if (id === undefined) throw new Error("no new id");
  return id;
}

test("P3: resizing a child grows its Hug frame (upward propagation, live)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // A frame, made an auto-flex row that HUGS its content, with one child.
  const F = await addFrame(page, rootId, { x: 0.2, y: 0.2, width: 0.3, height: 0.2, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: { kind: "auto-flex", direction: "row" },
  });
  await page.waitForFunction((id) => {
    let has = false;
    const walk = (n: N & { attrs: { layout?: unknown } }) => {
      if (String(n.id) === id) has = (n.attrs as { layout?: unknown }).layout !== undefined;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return has;
  }, F);
  // Child first — a Hug axis requires ≥1 child (setSizing rule).
  const child = await addFrame(page, F, { x: 0, y: 0, width: 1, height: 1, rotation: 0 });
  await exec(page, "weave.frame.setSizing", { itemId: F, sizing: { width: "hug", height: "hug" } });
  await page.waitForFunction((id) => {
    let hug = false;
    const walk = (n: N & { attrs: { layout?: { sizing?: { width?: string } } } }) => {
      if (String(n.id) === id) hug = n.attrs.layout?.sizing?.width === "hug";
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return hug;
  }, F);

  // Design-plane px basis → EXACT Figma hug (F = child px ÷ design width).
  const design = await page.evaluate(() => {
    const d = (window as unknown as { __weaveDesign?: { width: number; height: number } })
      .__weaveDesign;
    return { w: d?.width ?? 0, h: d?.height ?? 0 };
  });
  expect(design.w).toBeGreaterThan(0);

  const resize = async (w: number) => {
    await exec(page, "weave.item.resizeHug", {
      itemId: child,
      sizePx: { w, h: 40 },
      designWidth: design.w,
      designHeight: design.h,
    });
    await page.waitForFunction(
      ({ id, w }) => {
        let sp: number | undefined;
        const walk = (n: N) => {
          if (String(n.id) === id) sp = n.attrs.layoutChild?.sizePx?.w;
          for (const c of n.children) walk(c);
        };
        walk((window as unknown as W).__weaveDoc.root as unknown as N);
        return sp === w;
      },
      { id: child, w },
    );
    return (await findFrame(page, F)).width ?? 0;
  };

  // EXACT hug: single child, gap/pad 0 ⇒ F width = child px ÷ design width.
  const w1 = await resize(120);
  const w2 = await resize(240);

  const msg = `w1=${w1} w2=${w2} designW=${design.w}`;
  expect(w1, msg).toBeCloseTo(120 / design.w, 3); // exact, bootstrapped on FIRST resize
  expect(w2, msg).toBeCloseTo(240 / design.w, 3); // exact
  expect(w2 / w1, msg).toBeCloseTo(2, 1); // and proportional

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("P3: dragging a child's resize HANDLE grows its Hug frame (real pipeline)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // A frame F, auto-flex row, Hug both axes, with one child filling it.
  const F = await addFrame(page, rootId, { x: 0.2, y: 0.2, width: 0.3, height: 0.2, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: { kind: "auto-flex", direction: "row" },
  });
  await page.waitForFunction((id) => {
    let has = false;
    const walk = (n: N & { attrs: { layout?: unknown } }) => {
      if (String(n.id) === id) has = (n.attrs as { layout?: unknown }).layout !== undefined;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return has;
  }, F);
  const child = await addFrame(page, F, { x: 0, y: 0, width: 1, height: 1, rotation: 0 });
  await exec(page, "weave.frame.setSizing", { itemId: F, sizing: { width: "hug", height: "hug" } });
  await page.waitForFunction((id) => {
    let hug = false;
    const walk = (n: N & { attrs: { layout?: { sizing?: { width?: string } } } }) => {
      if (String(n.id) === id) hug = n.attrs.layout?.sizing?.width === "hug";
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return hug;
  }, F);

  // Select the child so its selection chrome (resize handles) renders.
  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, child);

  // The child's EAST resize handle (main axis of a row → resizable).
  const east = page
    .locator(`[data-selection-handle-item-id="${child}"] [data-handle-dir="e"]`)
    .first();
  await expect.poll(() => east.count()).toBeGreaterThan(0);
  const box = await east.boundingBox();
  if (box === null) throw new Error("no east resize handle");

  const before = (await findFrame(page, F)).width ?? 0;
  expect(before).toBeGreaterThan(0);

  // Drag the handle RIGHT — the child grows on its main axis, so F must hug wider.
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy, { steps: 12 });
  await page.mouse.up();

  // F grew (upward propagation through the real handle pipeline) and the child's
  // absolute px intrinsic was authored (option A).
  await page.waitForFunction(
    ({ id, w0 }) => {
      let w: number | undefined;
      const walk = (n: N) => {
        if (String(n.id) === id) w = n.attrs.frame?.width;
        for (const c of n.children) walk(c);
      };
      walk((window as unknown as W).__weaveDoc.root as unknown as N);
      return w !== undefined && w > w0 + 1e-4;
    },
    { id: F, w0: before },
  );

  const after = await findFrame(page, F);
  const childSizePx = await findFrame(page, child);
  const msg = `before=${before} after=${after.width} childSizePx=${childSizePx.sizePxW}`;
  expect(after.width ?? 0, msg).toBeGreaterThan(before);
  expect(childSizePx.sizePxW ?? 0, msg).toBeGreaterThan(0);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
