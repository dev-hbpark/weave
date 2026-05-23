import { expect, test } from "@playwright/test";
import { clearAllDesigns, prepareDesign } from "./helpers.js";

// Phase 13a — Properties panel. Mounts when a frame is selected, lets the
// user edit the frame's x/y/w/h/rotation + domain attrs (title/heading/etc.)
// + lists existing interactions.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

test("selecting a frame opens the properties panel; closing it deselects", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.getByTestId("properties-panel")).toHaveCount(0);

  // slide-deck flavor seeded one slide — select it via the outline.
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId("properties-panel")).toBeVisible();

  // Close button → panel unmounts + selection clears.
  await page.getByTestId("properties-close").click();
  await expect(page.getByTestId("properties-panel")).toHaveCount(0);
});

test("editing the title attr commits to the frame's attrs", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId("properties-panel")).toBeVisible();

  const titleInput = page.getByTestId("properties-attr-title");
  await titleInput.click();
  await titleInput.fill("Properties edited slide");

  // Verify the change landed on the agocraft document.
  const title = await page.evaluate(() => {
    type Item = { attrs: { title?: string } };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return doc?.root.children[0]?.attrs.title ?? null;
  });
  expect(title).toBe("Properties edited slide");
});

test("camera-target manual toggle + position edit (Phase 13b)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId("properties-panel")).toBeVisible();
  await expect(page.getByTestId("properties-interaction-camera-target")).toBeVisible();

  // Default = "auto ✦"
  const toggle = page.getByTestId("camera-target-toggle-manual");
  await expect(toggle).toHaveText(/auto/i);

  // Change x → should auto-promote to manual.
  const xInput = page.getByTestId("camera-target-x");
  await xInput.fill("0.75");
  await xInput.blur();

  await expect(toggle).toHaveText(/manual/i);
  const manualX = await page.evaluate(() => {
    type Unit = { kind: string; attrs: { behavior?: { manual?: boolean; position?: { x: number } } } };
    type Item = { units: ReadonlyArray<Unit> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const cam = doc?.root.children[0]?.units.find((u) => u.kind === "camera-target");
    return { manual: cam?.attrs.behavior?.manual, x: cam?.attrs.behavior?.position?.x };
  });
  expect(manualX.manual).toBe(true);
  expect(manualX.x).toBeCloseTo(0.75, 3);
});

test("Add hotspot + region edit (Phase 13c)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId("properties-panel")).toBeVisible();

  // No hotspot yet.
  await expect(page.getByTestId("properties-interaction-hotspot")).toHaveCount(0);

  // Add hotspot via button.
  await page.getByTestId("properties-add-hotspot").click();
  await expect(page.getByTestId("properties-interaction-hotspot")).toBeVisible();

  // Edit region.x.
  const xInput = page.getByTestId("hotspot-region-x");
  await xInput.fill("0.55");
  await xInput.blur();

  const region = await page.evaluate(() => {
    type Beh = { kind: string; region?: { x: number } };
    type Unit = { kind: string; attrs: { behavior?: Beh } };
    type Item = { units: ReadonlyArray<Unit> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const hot = doc?.root.children[0]?.units.find((u) => u.kind === "hotspot");
    return hot?.attrs.behavior?.region?.x ?? null;
  });
  expect(region).toBeCloseTo(0.55, 3);

  // Change action type.
  await page.getByTestId("hotspot-action-type").selectOption("external");
  const actionType = await page.evaluate(() => {
    type Beh = { kind: string; action?: { type: string } };
    type Unit = { kind: string; attrs: { behavior?: Beh } };
    type Item = { units: ReadonlyArray<Unit> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const hot = doc?.root.children[0]?.units.find((u) => u.kind === "hotspot");
    return hot?.attrs.behavior?.action?.type ?? null;
  });
  expect(actionType).toBe("external");
});

test("hotspot region visual overlay — drag-move (Phase 13c-2)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  await page.getByTestId("properties-add-hotspot").click();
  await expect(page.getByTestId("hotspot-region-overlay")).toBeVisible();

  // Select hotspot (overlay click).
  const overlay = page.getByTestId("hotspot-region-overlay").first();
  await overlay.click();
  // Drag the overlay body — small move so we stay inside the frame.
  const box = await overlay.boundingBox();
  if (box === null) throw new Error("overlay has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20);
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40);
  await page.mouse.up();
  await page.waitForTimeout(50);

  const next = await page.evaluate(() => {
    type Beh = { kind: string; region?: { x: number; y: number } };
    type Unit = { kind: string; attrs: { behavior?: Beh } };
    type Item = { units: ReadonlyArray<Unit> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const hot = doc?.root.children[0]?.units.find((u) => u.kind === "hotspot");
    return hot?.attrs.behavior?.region ?? null;
  });
  expect(next).not.toBeNull();
  if (next === null) return;
  expect(next.x).toBeGreaterThan(0.4); // moved right from default 0.4
});

test("add hover / button / animation interactions + edit (Phase 13d-2)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId("properties-panel")).toBeVisible();

  // Add 3 new interaction kinds.
  await page.getByTestId("properties-add-hover").click();
  await page.getByTestId("properties-add-button").click();
  await page.getByTestId("properties-add-animation").click();
  await expect(page.getByTestId("properties-interaction-hover-effect")).toBeVisible();
  await expect(page.getByTestId("properties-interaction-button-trigger")).toBeVisible();
  await expect(page.getByTestId("properties-interaction-entrance-animation")).toBeVisible();

  // Edit hover-effect mode.
  await page.getByTestId("hover-effect-mode").selectOption("dim-others");

  // Edit button-trigger action.
  await page.getByTestId("button-trigger-action").selectOption("external");

  // Edit entrance-animation mode + step + duration.
  await page.getByTestId("entrance-animation-mode").selectOption("zoom-in");
  await page.getByTestId("entrance-animation-step").fill("2");
  await page.getByTestId("entrance-animation-duration").fill("900");
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  const snapshot = await page.evaluate(() => {
    type Beh = { kind: string; effect?: string; action?: { type: string }; mode?: string; step?: number; durationMs?: number };
    type Unit = { kind: string; attrs: { behavior?: Beh } };
    type Item = { units: ReadonlyArray<Unit> };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const units = doc?.root.children[0]?.units ?? [];
    const find = (kind: string) =>
      units.find((u) => u.kind === kind)?.attrs.behavior ?? null;
    return {
      hover: find("hover-effect"),
      button: find("button-trigger"),
      anim: find("entrance-animation"),
    };
  });
  expect(snapshot.hover?.effect).toBe("dim-others");
  expect(snapshot.button?.action?.type).toBe("external");
  expect(snapshot.anim?.mode).toBe("zoom-in");
  expect(snapshot.anim?.step).toBe(2);
  expect(snapshot.anim?.durationMs).toBe(900);
});

test("entrance-animation 의 PresentPage 적용 — data-entrance-mode 부여 (Phase 13d-3)", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  await page.getByTestId("properties-add-animation").click();
  await page.getByTestId("entrance-animation-mode").selectOption("zoom-in");
  await page.getByTestId("entrance-animation-step").fill("0");
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  // 디자인의 첫 step 으로 진입.
  await page.getByTestId("toolbar-present").click();
  await expect(page.getByText("1 / 1", { exact: false })).toBeVisible();

  // PresentScene 의 data-entrance-mode 가 entrance-animation.mode 와 일치.
  await expect(page.getByTestId("present-scene")).toHaveAttribute(
    "data-entrance-mode",
    "zoom-in",
  );
});

test("hover-effect + button-trigger 의 PresentPage 적용 (Phase 13d-4)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "Triggers" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();

  // mixed flavor adds frames at the design center → both stacked. Pick the
  // top one (last in DOM order) to edit; that's the click target later too.
  const topFrame = page.locator('[data-frame-id]').last();
  await topFrame.click({ position: { x: 4, y: 4 } });
  await page.getByTestId("properties-add-hover").click();
  await page.getByTestId("hover-effect-mode").selectOption("dim-others");
  await page.getByTestId("properties-add-button").click();
  await page.getByTestId("button-trigger-action").selectOption("next-camera");
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  await page.getByTestId("toolbar-present").click();
  await expect(page.getByText("1 / 2", { exact: false })).toBeVisible();

  // The "top" (last-DOM) frame is step 2 in present order. Navigate to step 2,
  // hover its scene — the *other* scene (step 1) should dim.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 / 2", { exact: false })).toBeVisible();
  const step2Scene = page.getByTestId("present-scene").nth(1);
  await step2Scene.hover();
  await expect(step2Scene).toHaveAttribute("data-is-hovering", "true");
  await expect(step2Scene).toHaveAttribute("data-hover-effect", "dim-others");
  const step1Scene = page.getByTestId("present-scene").nth(0);
  await expect(step1Scene).toHaveAttribute("data-is-dimmed", "true");
});

test("frame x/y inputs commit ratio updates", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await page.getByTestId("toolbar-add").click();
  await page.getByTestId("toolbar-add-slide").click();
  await page.locator('[data-frame-id]').first().click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId("properties-panel")).toBeVisible();

  const xInput = page.getByTestId("properties-frame-x");
  await xInput.click();
  await xInput.fill("0.25");
  await xInput.blur();

  const x = await page.evaluate(() => {
    type Item = { attrs: { frame?: { x: number } } };
    type Doc = { root: { children: ReadonlyArray<Item> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return doc?.root.children[0]?.attrs.frame?.x ?? null;
  });
  expect(x).toBeCloseTo(0.25, 3);
});
