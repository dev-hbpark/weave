// WI-042 / DR-055 / FR-011 P3 — live proof that a Hug frame grows when a child
// inside it is resized (option A: resize writes the child's px sizePx, the engine
// reflows the Hug ancestor up). Drives via weave.frame.setSizing + resizeHug
// (toolbar is a later step). Demonstrates upward propagation end-to-end (the
// design-dims-free cancel-trick grows the Hug root PROPORTIONALLY; exact-hug
// bootstrap is a documented follow-up).
//
// Bootstraps without networkidle (the sandbox vite never settles).

import { expect, test } from "@playwright/test";

type W = {
  __weaveEditor: { exec: (n: string, i: unknown) => unknown };
  __weaveDoc: { root: { id: string | number; children: N[] } };
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

  // First resize seeds the child's px (Hug root has no old px basis yet → frame
  // unchanged; the cancel-trick needs a prior px to scale from).
  await exec(page, "weave.item.resizeHug", { itemId: child, sizePx: { w: 120, h: 40 } });
  await page.waitForFunction(
    ({ id }) => {
      let sp: number | undefined;
      const walk = (n: N) => {
        if (String(n.id) === id) sp = n.attrs.layoutChild?.sizePx?.w;
        for (const c of n.children) walk(c);
      };
      walk((window as unknown as W).__weaveDoc.root as unknown as N);
      return sp === 120;
    },
    { id: child },
  );
  const w1 = (await findFrame(page, F)).width ?? 0;

  // Second resize doubles the child's px → the Hug frame grows ~2×.
  await exec(page, "weave.item.resizeHug", { itemId: child, sizePx: { w: 240, h: 40 } });
  await page.waitForFunction(
    ({ id }) => {
      let sp: number | undefined;
      const walk = (n: N) => {
        if (String(n.id) === id) sp = n.attrs.layoutChild?.sizePx?.w;
        for (const c of n.children) walk(c);
      };
      walk((window as unknown as W).__weaveDoc.root as unknown as N);
      return sp === 240;
    },
    { id: child },
  );
  const w2 = (await findFrame(page, F)).width ?? 0;

  const msg = `w1=${w1} w2=${w2}`;
  expect(w1, msg).toBeGreaterThan(0);
  // child 120→240 (×2) ⇒ Hug frame width ~×2 (proportional upward growth).
  expect(w2 / w1, msg).toBeGreaterThan(1.8);
  expect(w2 / w1, msg).toBeLessThan(2.2);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
