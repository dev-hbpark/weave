import { test, expect } from "@playwright/test";
async function boot(page: any) {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "onLine", { get: () => false, configurable: true });
    localStorage.setItem("weave.dev.unlock-flavors", "1");
  });
  await page.goto("/");
  await page.getByTestId("landing-new-design").click();
  await page.getByTestId("new-design-flavor-canvas-board").click();
  await page.getByTestId("new-design-size-16:9").click();
  await page.getByTestId("new-design-create").click();
  await page.waitForURL(/\/design\/[^/]+$/);
  await page.waitForFunction(() => (window as any).__weaveEditor && (window as any).__weaveDoc);
  await page.locator('[data-design-plane="true"]').first().waitFor();
}
const exec = (page: any, n: string, i: unknown) =>
  page.evaluate(({ n, i }: any) => (window as any).__weaveEditor.exec(n, i), { n, i });
const ids = (page: any) =>
  page.evaluate(() => { const o: string[] = []; const w = (n: any) => { o.push(String(n.id)); for (const c of n.children) w(c); }; w((window as any).__weaveDoc.root); return o; });
async function add(page: any, i: any) { const b = new Set(await ids(page)); await exec(page, "weave.item.add", i); await page.waitForTimeout(70); return (await ids(page)).find((x: string) => !b.has(x))!; }
const frameOf = (page: any, id: string) =>
  page.evaluate((id: string) => { let f: any = null; const w = (n: any) => { if (String(n.id) === id) f = n.attrs.frame; for (const c of n.children) w(c); }; w((window as any).__weaveDoc.root); return f ? { w: +f.width.toFixed(3), h: +f.height.toFixed(3) } : null; }, id);
const design = { width: 1280, height: 720 };

test("setSizing width=Hug re-fits the container immediately (no resize)", async ({ page }) => {
  await boot(page);
  const root = await page.evaluate(() => String((window as any).__weaveDoc.root.id));
  // wide container (0.6) with small content children — content is narrower than the box.
  const R = await add(page, { kind: "frame", containerId: root, frame: { x: 0.1, y: 0.2, width: 0.6, height: 0.4, rotation: 0 } });
  await exec(page, "weave.frame.setLayout", { itemId: R, layout: { kind: "auto-flex", direction: "row", gap: 0.005 } });
  const A = await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.12, height: 0.5, rotation: 0 } });
  const B = await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.12, height: 0.5, rotation: 0 } });
  const before = await frameOf(page, R);
  console.log("R before Hug:", JSON.stringify(before));
  // set width=Hug WITH design dims (what the toolbar now passes)
  await exec(page, "weave.frame.setSizing", { itemId: R, sizing: { width: "hug", height: "fixed" }, designWidth: design.width, designHeight: design.height });
  await page.waitForTimeout(120);
  const after = await frameOf(page, R);
  console.log("R after Hug:", JSON.stringify(after), "A:", JSON.stringify(await frameOf(page, A)), "B:", JSON.stringify(await frameOf(page, B)));
  // container should have SHRUNK in width to hug its content (was 0.6)
  expect(after.w).toBeLessThan(before.w);
});

test("UNDO restores the container box after a Hug re-fit", async ({ page }) => {
  await boot(page);
  const root = await page.evaluate(() => String((window as any).__weaveDoc.root.id));
  const R = await add(page, { kind: "frame", containerId: root, frame: { x: 0.1, y: 0.2, width: 0.6, height: 0.4, rotation: 0 } });
  await exec(page, "weave.frame.setLayout", { itemId: R, layout: { kind: "auto-flex", direction: "row", gap: 0.005 } });
  await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.12, height: 0.5, rotation: 0 } });
  const before = await frameOf(page, R);
  await exec(page, "weave.frame.setSizing", { itemId: R, sizing: { width: "hug", height: "fixed" }, designWidth: design.width, designHeight: design.height });
  await page.waitForTimeout(80);
  await page.evaluate(() => (window as any).__weaveEditor.history.undo());
  await page.waitForTimeout(80);
  const afterUndo = await frameOf(page, R);
  console.log("UNDO R before:", JSON.stringify(before), "afterUndo:", JSON.stringify(afterUndo));
  expect(afterUndo.w).toBeCloseTo(before.w, 2);
});

test("setLayout (gap change) re-fits a Hug container (WI-048 #3)", async ({ page }) => {
  await boot(page);
  const root = await page.evaluate(() => String((window as any).__weaveDoc.root.id));
  const R = await add(page, { kind: "frame", containerId: root, frame: { x: 0.1, y: 0.2, width: 0.6, height: 0.4, rotation: 0 } });
  await exec(page, "weave.frame.setLayout", { itemId: R, layout: { kind: "auto-flex", direction: "row", gap: 0.005 } });
  await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.12, height: 0.5, rotation: 0 } });
  await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.12, height: 0.5, rotation: 0 } });
  await exec(page, "weave.frame.setSizing", { itemId: R, sizing: { width: "hug", height: "fixed" }, designWidth: design.width, designHeight: design.height });
  await page.waitForTimeout(100);
  const beforeGap = await frameOf(page, R);
  // Bump the gap as the real toolbar does — author the PX field (gapPx). The gap
  // is px-pinned (WI-224), so the ratio mirror alone is a no-op; gapPx is what
  // the engine reads. Preserve the rest of the layout (incl. sizing).
  const spec = await page.evaluate((id: string) => { let l: any; const w = (n: any) => { if (String(n.id) === id) l = n.attrs.layout; for (const c of n.children) w(c); }; w((window as any).__weaveDoc.root); return l; }, R);
  await exec(page, "weave.frame.setLayout", { itemId: R, layout: { ...spec, gapPx: (spec.gapPx ?? 0) + 80 }, designWidth: design.width, designHeight: design.height });
  await page.waitForTimeout(120);
  const afterGap = await frameOf(page, R);
  console.log("gap-refit R before:", JSON.stringify(beforeGap), "after:", JSON.stringify(afterGap));
  // a wider gap grows the width-Hug row's box.
  expect(afterGap.w).toBeGreaterThan(beforeGap.w);
});

test("Hug→Fixed bakes child basis so a later resize keeps child size constant (WI-048 #2)", async ({ page }) => {
  await boot(page);
  const root = await page.evaluate(() => String((window as any).__weaveDoc.root.id));
  const R = await add(page, { kind: "frame", containerId: root, frame: { x: 0.1, y: 0.2, width: 0.6, height: 0.4, rotation: 0 } });
  await exec(page, "weave.frame.setLayout", { itemId: R, layout: { kind: "auto-flex", direction: "row", gap: 0.005 } });
  const A = await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.12, height: 0.5, rotation: 0 } });
  await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.12, height: 0.5, rotation: 0 } });
  const dimsIn = { designWidth: design.width, designHeight: design.height };
  // Hug (container shrinks to fit; children fill it → frame ≫ authored basis).
  await exec(page, "weave.frame.setSizing", { itemId: R, sizing: { width: "hug", height: "fixed" }, ...dimsIn });
  await page.waitForTimeout(90);
  // Back to Fixed — the bake freezes each child's current frame ratio into basis.
  await exec(page, "weave.frame.setSizing", { itemId: R, sizing: { width: "fixed", height: "fixed" }, ...dimsIn });
  await page.waitForTimeout(90);
  const beforeResize = await frameOf(page, R);
  const childBefore: any = await frameOf(page, A);
  const childAbsBefore = childBefore.w * beforeResize.w * design.width;
  // Resize the (Fixed) container width ×2 — the child must keep its ABSOLUTE size.
  await exec(page, "weave.item.update", { itemId: R, attrs: { frame: { x: 0.1, y: 0.2, width: beforeResize.w * 2, height: beforeResize.h, rotation: 0 } } });
  await page.waitForTimeout(120);
  const afterResize = await frameOf(page, R);
  const childAfter: any = await frameOf(page, A);
  const childAbsAfter = childAfter.w * afterResize.w * design.width;
  console.log("#2 child abs before:", childAbsBefore, "after:", childAbsAfter);
  // Child keeps its absolute width (no shrink). Pre-fix it collapsed ~4×.
  expect(childAbsAfter).toBeCloseTo(childAbsBefore, 0);
});

test("WI-224 px-pin: repeated Hug with a gap is STABLE (no growth)", async ({ page }) => {
  await boot(page);
  const root = await page.evaluate(() => String((window as any).__weaveDoc.root.id));
  const R = await add(page, { kind: "frame", containerId: root, frame: { x: 0.05, y: 0.05, width: 0.5, height: 0.4, rotation: 0 } });
  await exec(page, "weave.frame.setLayout", { itemId: R, layout: { kind: "auto-flex", direction: "row", gap: 0.3 } });
  for (let i = 0; i < 4; i++) await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.1, height: 0.5, rotation: 0 } });
  const widths: number[] = [];
  for (let i = 0; i < 5; i++) {
    await exec(page, "weave.frame.setSizing", { itemId: R, sizing: { width: "hug", height: "fixed" }, designWidth: design.width, designHeight: design.height });
    await page.waitForTimeout(60);
    const f: any = await frameOf(page, R);
    widths.push(f.w);
  }
  console.log("gap-stable widths:", JSON.stringify(widths));
  // pre-fix this DIVERGED (gap re-derived from the growing box); now constant.
  expect(widths[4]).toBeCloseTo(widths[0], 3);
});

test("WI-224: moving a Hug container leaves its children unchanged", async ({ page }) => {
  await boot(page);
  const root = await page.evaluate(() => String((window as any).__weaveDoc.root.id));
  const R = await add(page, { kind: "frame", containerId: root, frame: { x: 0.1, y: 0.2, width: 0.6, height: 0.4, rotation: 0 } });
  await exec(page, "weave.frame.setLayout", { itemId: R, layout: { kind: "auto-flex", direction: "row", gap: 0.01 } });
  const A = await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.15, height: 0.5, rotation: 0 } });
  await add(page, { kind: "shape", containerId: R, frame: { x: 0, y: 0, width: 0.15, height: 0.5, rotation: 0 } });
  await exec(page, "weave.frame.setSizing", { itemId: R, sizing: { width: "hug", height: "hug" }, designWidth: design.width, designHeight: design.height });
  await page.waitForTimeout(80);
  const r0: any = await frameOf(page, R);
  const a0: any = await frameOf(page, A);
  const absBefore = { w: a0.w * r0.w * design.width, h: a0.h * r0.h * design.height };
  // MOVE only (same w/h, new x/y).
  await exec(page, "weave.item.update", { itemId: R, attrs: { frame: { x: 0.4, y: 0.5, width: r0.w, height: r0.h, rotation: 0 } } });
  await page.waitForTimeout(100);
  const r1: any = await frameOf(page, R);
  const a1: any = await frameOf(page, A);
  const absAfter = { w: a1.w * r1.w * design.width, h: a1.h * r1.h * design.height };
  console.log("move abs before:", JSON.stringify(absBefore), "after:", JSON.stringify(absAfter));
  // pre-fix the child shrank ~3× on a pure move; now unchanged.
  expect(absAfter.w).toBeCloseTo(absBefore.w, 0);
  expect(absAfter.h).toBeCloseTo(absBefore.h, 0);
});
