// WI-043 P4 — live proof that an auto-flex container with FIXED-px gap keeps the
// gap constant (in design px) regardless of the container's size, end-to-end
// through the weave resize path (weave.item.update → engine.onFrameChanged with
// design dims → adapter px-derivation). Legacy ratio gap would scale with the
// container; the px gap does not.
//
// Bootstraps without networkidle (the sandbox vite never settles).

import { expect, test } from "@playwright/test";

type W = {
  __weaveEditor: { exec: (n: string, i: unknown) => unknown };
  __weaveDoc: { root: { id: string | number; children: N[] } };
  __weaveDesign?: { width: number; height: number };
};
type N = {
  id: string | number;
  attrs: { frame?: { x: number; width: number } };
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

const xframe = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((id) => {
    let f: { x: number; width: number } | undefined;
    const walk = (n: N) => {
      if (String(n.id) === id) f = n.attrs.frame;
      for (const c of n.children) walk(c);
    };
    walk((window as unknown as W).__weaveDoc.root as unknown as N);
    return { x: f?.x ?? 0, width: f?.width ?? 0 };
  }, id);

test("auto-flex fixed-px gap stays constant in design px across container sizes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await bootstrap(page);

  const rootId = await page.evaluate(() => String((window as unknown as W).__weaveDoc.root.id));
  const design = await page.evaluate(() => {
    const d = (window as unknown as W).__weaveDesign;
    return { w: d?.width ?? 0, h: d?.height ?? 0 };
  });
  expect(design.w).toBeGreaterThan(0);

  // F = auto-flex row with a FIXED 40px gap; two children.
  const F = await addFrame(page, rootId, { x: 0.1, y: 0.2, width: 0.3, height: 0.2, rotation: 0 });
  await exec(page, "weave.frame.setLayout", {
    itemId: F,
    layout: { kind: "auto-flex", direction: "row", gapPx: 40 },
  });
  const A = await addFrame(page, F, { x: 0, y: 0, width: 0.4, height: 1, rotation: 0 });
  const B = await addFrame(page, F, { x: 0.4, y: 0, width: 0.4, height: 1, rotation: 0 });

  // Resize F to ratio width `w` (vary height to bypass the no-op guard while the
  // main axis still reflows), passing design dims so the engine derives px gap.
  // Return the gap between A and B converted back to DESIGN px.
  const gapDesignPx = async (w: number): Promise<number> => {
    await exec(page, "weave.item.update", {
      itemId: F,
      attrs: { frame: { x: 0.1, y: 0.2, width: w, height: 0.25, rotation: 0 } },
      designWidth: design.w,
      designHeight: design.h,
    });
    await page.waitForFunction(
      ({ id, w }) => {
        let fw: number | undefined;
        const walk = (n: N) => {
          if (String(n.id) === id) fw = n.attrs.frame?.width;
          for (const c of n.children) walk(c);
        };
        walk((window as unknown as W).__weaveDoc.root as unknown as N);
        return fw !== undefined && Math.abs(fw - w) < 1e-6;
      },
      { id: F, w },
    );
    const a = await xframe(page, A);
    const b = await xframe(page, B);
    const gapRatioOfF = b.x - (a.x + a.width); // ratio of F's width
    return gapRatioOfF * w * design.w; // → design px
  };

  const wide = await gapDesignPx(0.5);
  const narrow = await gapDesignPx(0.25);
  const msg = `gap@0.5=${wide}px gap@0.25=${narrow}px (expected ≈40 both)`;
  expect(wide, msg).toBeCloseTo(40, 0); // fixed px, not ratio
  expect(narrow, msg).toBeCloseTo(40, 0); // SAME px at half the width

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
