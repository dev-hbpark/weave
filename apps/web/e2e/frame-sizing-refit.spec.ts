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
