// WI-217 / DR-138 S3 — selection chrome reads the engine scene geometry
// (rotation-aware), not the rendered element's `getBoundingClientRect` box.
//
// Pins the regression the DOM-readback chrome had: a rotated frame's handles
// must sit on the ROTATED corners, not the axis-aligned bounding box. Also
// covers the axis-aligned baseline + that the repositioned handle still drives
// its resize gesture.
//
// Bootstraps without `networkidle` (waits on the __weave* handshake + the
// design-plane selector) — robust regardless of the vite dev-server's
// fire-and-forget asset/sync traffic.

import { expect, test } from "@playwright/test";

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

/** All item ids in the live doc (deep). */
async function allIds(page: import("@playwright/test").Page): Promise<string[]> {
  return await page.evaluate(() => {
    type N = { id: string | number; children: N[] };
    const root = (window as unknown as { __weaveDoc: { root: N } }).__weaveDoc.root;
    const out: string[] = [];
    const walk = (n: N) => {
      out.push(String(n.id));
      for (const c of n.children) walk(c);
    };
    walk(root);
    return out;
  });
}

async function addFrame(
  page: import("@playwright/test").Page,
  frame: { x: number; y: number; width: number; height: number; rotation: number },
  containerId?: string,
): Promise<string> {
  // `__weaveDoc` updates ASYNC after exec (ChangeStream → applyChange → setAgoDoc
  // → React), so the new id must be read after a NEW id appears — reading it
  // synchronously returns the stale doc. Diff the full id set so this works for
  // both root-level and nested (containerId) adds.
  const before = new Set(await allIds(page));
  await page.evaluate(
    ({ frame, containerId }) => {
      const w = window as unknown as {
        __weaveEditor: { exec: (n: string, i: unknown) => unknown };
        __weaveDoc: { root: { id: string | number } };
      };
      w.__weaveEditor.exec("weave.item.add", {
        kind: "frame",
        containerId: containerId ?? String(w.__weaveDoc.root.id),
        frame,
      });
    },
    { frame, containerId: containerId ?? null },
  );
  await page.waitForFunction((knownLen) => {
    type N = { id: string | number; children: N[] };
    const root = (window as unknown as { __weaveDoc: { root: N } }).__weaveDoc.root;
    let count = 0;
    const walk = (n: N) => {
      count++;
      for (const c of n.children) walk(c);
    };
    walk(root);
    return count > knownLen;
  }, before.size);
  const after = await allIds(page);
  const id = after.find((x) => !before.has(x));
  if (id === undefined) throw new Error("addFrame: no new id appeared");
  // `weave.item.add` does not persist rotation; set the full frame explicitly,
  // then wait for the model to carry it.
  if (frame.rotation !== 0) {
    await page.evaluate(
      ({ id, frame }) => {
        (
          window as unknown as { __weaveEditor: { exec: (n: string, i: unknown) => unknown } }
        ).__weaveEditor.exec("weave.item.update", { itemId: id, attrs: { frame } });
      },
      { id, frame },
    );
    await page.waitForFunction(
      ({ id, rot }) => {
        type N = { id: string | number; attrs: { frame?: { rotation: number } }; children: N[] };
        const root = (window as unknown as { __weaveDoc: { root: N } }).__weaveDoc.root;
        let f: { rotation: number } | undefined;
        const walk = (n: N) => {
          if (String(n.id) === id) f = n.attrs.frame;
          for (const c of n.children) walk(c);
        };
        walk(root);
        return f !== undefined && Math.abs(f.rotation - rot) < 1e-6;
      },
      { id, rot: frame.rotation },
    );
  }
  return id;
}

/** Expected viewport position of a corner handle, computed from the frame model
 *  + the live design-plane rect — the rotation-aware ground truth. */
async function expectedCorner(
  page: import("@playwright/test").Page,
  frameId: string,
  corner: "se" | "nw",
): Promise<{ rotated: { x: number; y: number }; aabb: { x: number; y: number } }> {
  return await page.evaluate(
    ({ frameId, corner }) => {
      type Frame = { x: number; y: number; width: number; height: number; rotation: number };
      type Node = {
        id: string | number;
        kind: string;
        attrs: { frame?: Frame };
        children: ReadonlyArray<Node>;
      };
      const w = window as unknown as { __weaveDoc?: { root: Node } };
      const root = w.__weaveDoc?.root;
      if (root === undefined) throw new Error("no doc");
      let found: Node | undefined;
      const walk = (n: Node) => {
        if (String(n.id) === frameId) found = n;
        for (const c of n.children) walk(c);
      };
      walk(root);
      const f = found?.attrs.frame;
      if (f === undefined) throw new Error("frame not found");
      const plane = document.querySelector('[data-design-plane="true"]') as HTMLElement;
      const r = plane.getBoundingClientRect();
      // offsetWidth/Height = unscaled CSS box = designWidth/Height; the rect is
      // scaled by the full base×camera transform, so r.width/offsetWidth = scale.
      const dw = plane.offsetWidth;
      const dh = plane.offsetHeight;
      const sx = r.width / dw;
      const sy = r.height / dh;
      // design-px geometry (top-level frame → parent is the design canvas)
      const cx = (f.x + f.width / 2) * dw;
      const cy = (f.y + f.height / 2) * dh;
      const hw = (f.width * dw) / 2;
      const hh = (f.height * dh) / 2;
      const sign = corner === "se" ? { x: 1, y: 1 } : { x: -1, y: -1 };
      const lx = sign.x * hw;
      const ly = sign.y * hh;
      const cos = Math.cos(f.rotation);
      const sin = Math.sin(f.rotation);
      const rx = cx + lx * cos - ly * sin;
      const ry = cy + lx * sin + ly * cos;
      return {
        rotated: { x: r.left + rx * sx, y: r.top + ry * sy },
        aabb: { x: r.left + (cx + lx) * sx, y: r.top + (cy + ly) * sy },
      };
    },
    { frameId, corner },
  );
}

test("S3: selection handles sit on the (rotation-aware) scene corners", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await bootstrap(page);

  // ── Case A: axis-aligned frame — handles on the box corners, outline shown ──
  const idA = await addFrame(page, { x: 0.2, y: 0.2, width: 0.25, height: 0.25, rotation: 0 });
  await page.locator('[data-design-plane="true"]').locator(`[data-frame-id="${idA}"]`).click();
  const outline = page.locator('[data-selection-handle-id="frame-outline"]');
  await expect(outline).toBeVisible();
  const seA = page.getByRole("button", { name: "Resize se", exact: true }).first();
  await expect(seA).toBeVisible();

  const expA = await expectedCorner(page, idA, "se");
  const seABox = await seA.boundingBox();
  if (seABox === null) throw new Error("se handle (A) has no box");
  const seACenter = { x: seABox.x + seABox.width / 2, y: seABox.y + seABox.height / 2 };
  expect(Math.hypot(seACenter.x - expA.rotated.x, seACenter.y - expA.rotated.y)).toBeLessThan(10);

  // The repositioned handle still drives its gesture — drag SE, model grows.
  const frameOf = (id: string) =>
    page.evaluate((id) => {
      type N = {
        id: string | number;
        attrs: { frame?: { width: number; height: number } };
        children: N[];
      };
      const root = (window as unknown as { __weaveDoc: { root: N } }).__weaveDoc.root;
      let f: { width: number; height: number } | undefined;
      const walk = (n: N) => {
        if (String(n.id) === id) f = n.attrs.frame;
        for (const c of n.children) walk(c);
      };
      walk(root);
      return f;
    }, id);
  const beforeDrag = await frameOf(idA);
  if (beforeDrag === undefined) throw new Error("frame A model missing");
  await page.mouse.move(seACenter.x, seACenter.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(seACenter.x + 12 * i, seACenter.y + 10 * i);
  await page.mouse.up();
  await page.waitForFunction(
    ({ id, w0, h0 }) => {
      type N = {
        id: string | number;
        attrs: { frame?: { width: number; height: number } };
        children: N[];
      };
      const root = (window as unknown as { __weaveDoc: { root: N } }).__weaveDoc.root;
      let f: { width: number; height: number } | undefined;
      const walk = (n: N) => {
        if (String(n.id) === id) f = n.attrs.frame;
        for (const c of n.children) walk(c);
      };
      walk(root);
      return f !== undefined && (Math.abs(f.width - w0) > 1e-4 || Math.abs(f.height - h0) > 1e-4);
    },
    { id: idA, w0: beforeDrag.width, h0: beforeDrag.height },
  );

  // ── Case B: rotated frame — handle must follow the ROTATED corner, NOT the
  //    axis-aligned bbox corner (the bug the DOM-readback chrome had) ──
  const idB = await addFrame(page, { x: 0.55, y: 0.45, width: 0.22, height: 0.16, rotation: 0.6 });
  await page.locator('[data-design-plane="true"]').locator(`[data-frame-id="${idB}"]`).click();
  const seB = page.getByRole("button", { name: "Resize se", exact: true }).first();
  await expect(seB).toBeVisible();

  const expB = await expectedCorner(page, idB, "se");
  const seBBox = await seB.boundingBox();
  if (seBBox === null) throw new Error("se handle (B) has no box");
  const seBCenter = { x: seBBox.x + seBBox.width / 2, y: seBBox.y + seBBox.height / 2 };
  const distRotated = Math.hypot(seBCenter.x - expB.rotated.x, seBCenter.y - expB.rotated.y);
  const distAabb = Math.hypot(seBCenter.x - expB.aabb.x, seBCenter.y - expB.aabb.y);
  // Sits on the rotated corner …
  expect(distRotated).toBeLessThan(10);
  // … and the rotated corner is meaningfully different from the AABB corner, so
  // this genuinely exercised rotation-awareness (guards against a false pass).
  expect(Math.hypot(expB.rotated.x - expB.aabb.x, expB.rotated.y - expB.aabb.y)).toBeGreaterThan(
    20,
  );
  expect(distAabb).toBeGreaterThan(15);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});

// WI-217 S3 — the right-click layer picker's hit-test now delegates to the
// engine scene (`computeScene` + `hitTestScene`) behind the same
// `findFramesAtPoint` signature. Live-confirm the wiring still resolves an
// overlapping (nested) stack end-to-end in the running app.
test("S3: layer picker lists the nested overlap via the engine hit-test", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await bootstrap(page);

  const parent = await addFrame(page, { x: 0.2, y: 0.2, width: 0.55, height: 0.55, rotation: 0 });
  // Nested child, ratio-of-parent, comfortably inside so its centre is a clean
  // two-frame overlap (child + parent).
  const child = await addFrame(
    page,
    { x: 0.25, y: 0.25, width: 0.5, height: 0.5, rotation: 0 },
    parent,
  );

  // Right-click the child (locator form synthesises the contextmenu event).
  await page
    .locator(`[data-testid="block-frame"][data-frame-id="${child}"]`)
    .click({ button: "right", position: { x: 6, y: 6 } });

  // The context menu opened (delete row present) and the Select-layer section
  // lists BOTH frames — proving findFramesAtPoint returned the engine-composed
  // overlap stack.
  await expect(page.getByTestId("ctx-delete-frame")).toBeVisible();
  await expect(page.getByTestId(`layer-pick-${child}`)).toBeVisible();
  await expect(page.getByTestId(`layer-pick-${parent}`)).toBeVisible();
  // Deepest-first: the child row sits above the parent row.
  const cBox = await page.getByTestId(`layer-pick-${child}`).boundingBox();
  const pBox = await page.getByTestId(`layer-pick-${parent}`).boundingBox();
  if (cBox === null || pBox === null) throw new Error("layer rows have no box");
  expect(cBox.y).toBeLessThan(pBox.y);

  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);
});
