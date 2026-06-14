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

test("P3 ①: toolbar Fixed/Hug segment sets a frame's container sizing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // An auto-flex frame with one child (Hug needs ≥1 child).
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
  await addFrame(page, F, { x: 0, y: 0, width: 1, height: 1, rotation: 0 });

  // Select the FRAME → the contextual toolbar + container-sizing controls mount.
  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, F);

  await page.locator('[data-testid="frame-sizing-controls"]').first().waitFor();

  const sizingOf = (id: string) =>
    page.evaluate((fid) => {
      let s: { width?: string; height?: string } | undefined;
      const walk = (
        n: N & { attrs: { layout?: { sizing?: { width?: string; height?: string } } } },
      ) => {
        if (String(n.id) === fid) s = n.attrs.layout?.sizing;
        for (const c of n.children) walk(c as never);
      };
      walk((window as unknown as W).__weaveDoc.root as never);
      return s ?? null;
    }, id);

  // Starts unset (defaults to fixed/fixed).
  expect(await sizingOf(F)).toBeNull();

  // Open the WIDTH sizing combobox → pick "내용맞춤" (Hug).
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
  expect((await sizingOf(F))?.width).toBe("hug");
  expect((await sizingOf(F))?.height).toBe("fixed"); // other axis carried forward

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("P3 ①(fill bridge): a Hug row hugs ONLY its fixed child; a grow sibling contributes 0", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

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
  const A = await addFrame(page, F, { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 });
  const B = await addFrame(page, F, { x: 0.5, y: 0, width: 0.5, height: 1, rotation: 0 });
  await exec(page, "weave.frame.setSizing", {
    itemId: F,
    sizing: { width: "hug", height: "fixed" },
  });

  // Make B FILL the main axis (grow 1) while carrying a non-zero sizePx that the
  // bridge MUST exclude from the Hug measure. Stored verbatim by the engine.
  await exec(page, "weave.item.setLayoutChild", {
    itemId: B,
    policy: { kind: "auto-flex", grow: 1, shrink: 1, basis: "auto", sizePx: { w: 80, h: 30 } },
  });
  // Precondition: B really carries grow + sizePx (else the test wouldn't be a
  // bridge test — a 0-sizePx child contributes 0 anyway).
  const bPolicy = await page.evaluate((id) => {
    let p: { grow?: number; sizePx?: { w?: number } } | undefined;
    const walk = (
      n: N & { attrs: { layoutChild?: { grow?: number; sizePx?: { w?: number } } } },
    ) => {
      if (String(n.id) === id) p = n.attrs.layoutChild;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return p ?? null;
  }, B);
  expect(bPolicy?.grow).toBe(1);
  expect(bPolicy?.sizePx?.w).toBe(80);

  const design = await page.evaluate(() => {
    const d = (window as unknown as { __weaveDesign?: { width: number; height: number } })
      .__weaveDesign;
    return { w: d?.width ?? 0, h: d?.height ?? 0 };
  });
  expect(design.w).toBeGreaterThan(0);

  // Resize the FIXED child A to 240px. The Hug width must be A's 240 ONLY — the
  // grow sibling B is main-axis fill (contributes 0). Without the bridge it would
  // be 240 + 80 = 320.
  await exec(page, "weave.item.resizeHug", {
    itemId: A,
    sizePx: { w: 240, h: 40 },
    designWidth: design.w,
    designHeight: design.h,
  });
  await page.waitForFunction(
    ({ id, target }) => {
      let w: number | undefined;
      const walk = (n: N) => {
        if (String(n.id) === id) w = n.attrs.frame?.width;
        for (const c of n.children) walk(c);
      };
      walk((window as unknown as W).__weaveDoc.root as unknown as N);
      return w !== undefined && Math.abs(w - target) < 1e-3;
    },
    { id: F, target: 240 / design.w },
  );

  const fw = (await findFrame(page, F)).width ?? 0;
  const msg = `F.width=${fw} expected≈${240 / design.w} (NOT ${320 / design.w})`;
  expect(fw, msg).toBeCloseTo(240 / design.w, 3); // hug = A only
  expect(fw, msg).not.toBeCloseTo(320 / design.w, 3); // B excluded

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("P3 ①(unified 3-way): toolbar Fill routes to layoutChild.grow (dual-routing, one undo)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // Outer auto-flex ROW O ⊃ inner auto-flex frame F (so F has a flex parent ⇒
  // the Fill option is offered; width is F's MAIN axis in a row parent).
  const O = await addFrame(page, rootId, { x: 0.1, y: 0.1, width: 0.6, height: 0.4, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: O,
    layout: { kind: "auto-flex", direction: "row" },
  });
  const F = await addFrame(page, O, { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: { kind: "auto-flex", direction: "row" },
  });
  await page.waitForFunction((id) => {
    let ok = false;
    const walk = (n: N & { attrs: { layout?: { kind?: string } } }) => {
      if (String(n.id) === id) ok = n.attrs.layout?.kind === "auto-flex";
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return ok;
  }, F);

  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, F);
  await page.locator('[data-testid="frame-sizing-controls"]').first().waitFor();

  // The Fill option exists ONLY because F has a flex parent. Open the WIDTH
  // sizing combobox → pick "채움" (Fill).
  await page.locator('[data-testid="frame-sizing-width"]').click();
  const fillSeg = page.locator('[data-testid="frame-sizing-width-option-fill"]');
  await expect.poll(() => fillSeg.count()).toBe(1);
  await fillSeg.click();

  // Fill (width = MAIN axis in a row parent) → layoutChild.grow = 1, and the
  // frame's own width sizing becomes Fixed (filling, not hugging) — both in ONE
  // batched transaction.
  const readF = () =>
    page.evaluate((id) => {
      let r: { grow?: number; ownW?: string } | undefined;
      const walk = (
        n: N & {
          attrs: {
            layout?: { sizing?: { width?: string } };
            layoutChild?: { grow?: number };
          };
        },
      ) => {
        if (String(n.id) === id)
          r = { grow: n.attrs.layoutChild?.grow, ownW: n.attrs.layout?.sizing?.width };
        for (const c of n.children) walk(c as never);
      };
      walk((window as unknown as W).__weaveDoc.root as never);
      return r ?? null;
    }, F);

  await page.waitForFunction((id) => {
    let g: number | undefined;
    const walk = (n: N & { attrs: { layoutChild?: { grow?: number } } }) => {
      if (String(n.id) === id) g = n.attrs.layoutChild?.grow;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return g === 1;
  }, F);
  expect((await readF())?.grow).toBe(1);
  expect((await readF())?.ownW).toBe("fixed");

  // One undo reverts the whole dual-routed change (grow back to 0).
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await page.waitForFunction((id) => {
    let g: number | undefined;
    const walk = (n: N & { attrs: { layoutChild?: { grow?: number } } }) => {
      if (String(n.id) === id) g = n.attrs.layoutChild?.grow;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return (g ?? 0) === 0;
  }, F);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("P4: a Hug auto-GRID grows to its cell content (toolbar Hug + resize, live)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // A 2-column auto-grid frame G with two children placed in columns 1 and 2.
  const G = await addFrame(page, rootId, { x: 0.1, y: 0.1, width: 0.5, height: 0.3, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: G,
    layout: {
      kind: "auto-grid",
      columns: [
        { kind: "fr", value: 1 },
        { kind: "fr", value: 1 },
      ],
      rows: [{ kind: "fr", value: 1 }],
      columnGap: 0,
      rowGap: 0,
      justify: "stretch",
      align: "stretch",
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  });
  await page.waitForFunction((id) => {
    let ok = false;
    const walk = (n: N & { attrs: { layout?: { kind?: string } } }) => {
      if (String(n.id) === id) ok = n.attrs.layout?.kind === "auto-grid";
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return ok;
  }, G);
  const A = await addFrame(page, G, { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 });
  const B = await addFrame(page, G, { x: 0.5, y: 0, width: 0.5, height: 1, rotation: 0 });
  await exec(page, "weave.item.setLayoutChild", {
    itemId: A,
    policy: { kind: "auto-grid", column: 1, columnSpan: 1, row: 1, rowSpan: 1 },
  });
  await exec(page, "weave.item.setLayoutChild", {
    itemId: B,
    policy: { kind: "auto-grid", column: 2, columnSpan: 1, row: 1, rowSpan: 1 },
  });

  // Select G → the unified sizing control mounts for the GRID container (P4).
  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, G);
  await page.locator('[data-testid="frame-sizing-controls"]').first().waitFor();

  // Toolbar "내용맞춤" (Hug) on the width → grid container sizing accepts grid.
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
  }, G);

  const design = await page.evaluate(() => {
    const d = (window as unknown as { __weaveDesign?: { width: number; height: number } })
      .__weaveDesign;
    return { w: d?.width ?? 0, h: d?.height ?? 0 };
  });
  expect(design.w).toBeGreaterThan(0);

  // Resize cell A's content to 300px. The Hug grid grows its column 1 track to
  // fit (B's column 2 has no authored content ⇒ 0). Grid width = 300 ÷ design w.
  await exec(page, "weave.item.resizeHug", {
    itemId: A,
    sizePx: { w: 300, h: 40 },
    designWidth: design.w,
    designHeight: design.h,
  });
  await page.waitForFunction(
    ({ id, target }) => {
      let w: number | undefined;
      const walk = (n: N) => {
        if (String(n.id) === id) w = n.attrs.frame?.width;
        for (const c of n.children) walk(c);
      };
      walk((window as unknown as W).__weaveDoc.root as unknown as N);
      return w !== undefined && Math.abs(w - target) < 2e-3;
    },
    { id: G, target: 300 / design.w },
  );

  const gw = (await findFrame(page, G)).width ?? 0;
  expect(gw, `G.width=${gw} expected≈${300 / design.w}`).toBeCloseTo(300 / design.w, 2);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("P4(px 일원화): a Hug row honors its RATIO gap (derived px, live)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // F at width 0.3, an auto-flex row with a RATIO gap (0.05) — NO gapPx authored.
  const F = await addFrame(page, rootId, { x: 0.2, y: 0.2, width: 0.3, height: 0.2, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: { kind: "auto-flex", direction: "row", gap: 0.05 },
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
  const A = await addFrame(page, F, { x: 0, y: 0, width: 0.5, height: 1, rotation: 0 });
  await addFrame(page, F, { x: 0.5, y: 0, width: 0.5, height: 1, rotation: 0 });
  await exec(page, "weave.frame.setSizing", {
    itemId: F,
    sizing: { width: "hug", height: "fixed" },
  });

  const design = await page.evaluate(() => {
    const d = (window as unknown as { __weaveDesign?: { width: number; height: number } })
      .__weaveDesign;
    return { w: d?.width ?? 0, h: d?.height ?? 0 };
  });
  expect(design.w).toBeGreaterThan(0);

  // Resize A to 300px. The Hug width must include the gap DERIVED from the ratio
  // gap × F's current px width (0.05 × 0.3·designW). B has no authored content (0).
  //   F.width = (300 + gapPx) / designW = 300/designW + 0.05·0.3 = 300/designW + 0.015.
  await exec(page, "weave.item.resizeHug", {
    itemId: A,
    sizePx: { w: 300, h: 40 },
    designWidth: design.w,
    designHeight: design.h,
  });
  const expected = 300 / design.w + 0.015;
  await page.waitForFunction(
    ({ id, target }) => {
      let w: number | undefined;
      const walk = (n: N) => {
        if (String(n.id) === id) w = n.attrs.frame?.width;
        for (const c of n.children) walk(c);
      };
      walk((window as unknown as W).__weaveDoc.root as unknown as N);
      return w !== undefined && Math.abs(w - target) < 2e-3;
    },
    { id: F, target: expected },
  );

  const fw = (await findFrame(page, F)).width ?? 0;
  const msg = `F.width=${fw} expected≈${expected} (gap honored; NOT ${300 / design.w})`;
  expect(fw, msg).toBeCloseTo(expected, 2); // ratio gap derived to px
  expect(fw, msg).toBeGreaterThan(300 / design.w + 0.005); // strictly more than no-gap

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("P4: a Hug axis disables its own resize handles (Figma parity)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

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
  await addFrame(page, F, { x: 0, y: 0, width: 1, height: 1, rotation: 0 });
  // Hug WIDTH, Fixed HEIGHT → width handles (e/w + corners) disabled, height
  // handles (n/s) kept.
  await exec(page, "weave.frame.setSizing", {
    itemId: F,
    sizing: { width: "hug", height: "fixed" },
  });

  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, F);

  const handleIds = async (): Promise<string[]> =>
    page.evaluate((id) => {
      const out: string[] = [];
      document.querySelectorAll(`[data-selection-handle-item-id="${id}"]`).forEach((n) => {
        const h = n.getAttribute("data-selection-handle-id");
        if (h !== null) out.push(h);
      });
      return out;
    }, F);

  await expect.poll(async () => (await handleIds()).length).toBeGreaterThan(0);
  const ids = await handleIds();
  const msg = `handles=${ids.join(",")}`;
  // Width (Hug) handles gone; the corners touch width so they go too.
  expect(ids, msg).not.toContain("resize-e");
  expect(ids, msg).not.toContain("resize-w");
  expect(ids, msg).not.toContain("resize-ne");
  expect(ids, msg).not.toContain("resize-sw");
  // Height (Fixed) handles remain.
  expect(ids, msg).toContain("resize-n");
  expect(ids, msg).toContain("resize-s");

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("P4 ①: cross-Fill via the 3-way hides the redundant align-self control", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));

  // Auto-flex ROW parent P ⊃ auto-flex frame F. F is both a flex CHILD (→ the
  // align-self control) and a container (→ the unified 3-way). Cross axis = height.
  const P = await addFrame(page, rootId, { x: 0.1, y: 0.1, width: 0.7, height: 0.5, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: P,
    layout: { kind: "auto-flex", direction: "row" },
  });
  const F = await addFrame(page, P, { x: 0, y: 0, width: 0.4, height: 0.6, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: { kind: "auto-flex", direction: "row" },
  });
  await page.waitForFunction((id) => {
    let ok = false;
    const walk = (n: N & { attrs: { layout?: { kind?: string } } }) => {
      if (String(n.id) === id) ok = n.attrs.layout?.kind === "auto-flex";
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return ok;
  }, F);

  await page.evaluate((id) => {
    (window as unknown as W).__weaveVm?.itemSelection.set(id);
  }, F);
  await page.locator('[data-testid="frame-sizing-controls"]').first().waitFor();

  const alignField = page.locator('[data-testid="flex-child-controls"]').getByText("자기 정렬");
  // Before: align-self control visible (cross not filling).
  await expect.poll(() => alignField.count()).toBe(1);

  // Set the CROSS axis (height, in a row) to Fill via the combobox → alignSelf=stretch.
  await page.locator('[data-testid="frame-sizing-height"]').click();
  await page.locator('[data-testid="frame-sizing-height-option-fill"]').click();
  await page.waitForFunction((id) => {
    let a: string | undefined;
    const walk = (n: N & { attrs: { layoutChild?: { alignSelf?: string } } }) => {
      if (String(n.id) === id) a = n.attrs.layoutChild?.alignSelf;
      for (const c of n.children) walk(c as never);
    };
    walk((window as unknown as W).__weaveDoc.root as never);
    return a === "stretch";
  }, F);

  // After: the redundant align-self control is gone (the 3-way owns cross-Fill).
  await expect.poll(() => alignField.count()).toBe(0);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
