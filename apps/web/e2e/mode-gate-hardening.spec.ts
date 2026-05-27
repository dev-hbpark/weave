// WI-040 Phase 1 — InteractionMode gate hardening.
//
// Three bug surfaces this spec pins down:
//
//   1. Hand mode (Space hold) leaks item drag. The frame-move /
//      resize / rotate bindings have to refuse the press while the
//      user has armed pan — otherwise the pan never reaches its
//      fallback binding and the frame moves under the cursor instead.
//   2. LayerPicker (right-click ContextMenu) competes with selection
//      chrome. While the menu is open, the handles should disappear
//      so the menu owns the visual and pointer space; they return on
//      close.
//   3. RubberBandLayer's reviewing/previewing slot must clear when a
//      mode that takes over the canvas opens (context-menu / hand /
//      panning / text-editing / frame-manipulating) — otherwise the
//      popover + rectangle orphan over the new owner.
//
// All three are bug-fix specs — they are expected to FAIL on `main`
// before the matching FrameStage / RubberBandLayer / interaction-mode
// changes land.

import { expect, type Page, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign } from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

interface FrameRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

async function rectOfFrame(page: Page, frameId: string): Promise<FrameRect> {
  return await page.evaluate((id) => {
    const el = document.querySelector(`[data-frame-id="${id}"]`) as HTMLElement | null;
    if (el === null) throw new Error(`no element for frame ${id}`);
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, frameId);
}

async function lastFrameId(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveDoc?: { root: { children: ReadonlyArray<{ id: unknown }> } };
    };
    const last = w.__weaveDoc?.root.children?.at(-1);
    return last === undefined ? "" : String(last.id);
  });
  if (id === "") throw new Error("no frames in design");
  return id;
}

async function interactionMode(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { mode: { get: () => string } };
    };
    return String(w.__weaveVm?.mode.get() ?? "<missing>");
  });
}

test("Space-held pan blocks frame-body drag (Hand mode leak)", async ({ page }) => {
  // `mixed` flavor — infinite canvas mode where Space-pan is active.
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 hand mode" });
  await addFrame(page, "frame", {
    frame: { x: 0.3, y: 0.3, width: 0.3, height: 0.3, rotation: 0 },
  });
  const frameId = await lastFrameId(page);
  const before = await rectOfFrame(page, frameId);

  // Hold Space → mode publishes "hand". The frame-move binding must
  // unregister so the upcoming drag falls through to the pan binding.
  await page.keyboard.down("Space");
  await expect.poll(() => interactionMode(page)).toBe("hand");

  // Drag horizontally across the frame body. With the fix in place,
  // the frame's position does NOT change — pan absorbs the gesture.
  const startX = before.left + before.width / 2;
  const startY = before.top + before.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 60, { steps: 8 });
  await page.mouse.up();

  await page.keyboard.up("Space");

  // Frame's design-space coords must be unchanged. (Viewport rect
  // may shift if pan succeeded — we compare the doc model instead.)
  const moved = await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{ id: unknown; attrs: { frame: { x: number; y: number } } }>;
        };
      };
    };
    const f = w.__weaveDoc?.root.children?.find((c) => String(c.id) === id);
    return f === undefined ? null : { x: f.attrs.frame.x, y: f.attrs.frame.y };
  }, frameId);
  if (moved === null) throw new Error("frame not found after Space-pan attempt");
  // Original was x=0.3, y=0.3. Allow a tiny float tolerance.
  expect(moved.x).toBeCloseTo(0.3, 5);
  expect(moved.y).toBeCloseTo(0.3, 5);
});

test("LayerPicker open hides SelectionLayer chrome; close restores it", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 chrome hide" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  const frameId = await lastFrameId(page);
  const rect = await rectOfFrame(page, frameId);

  // Click the frame to select it — selection chrome must mount.
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await expect.poll(() => interactionMode(page)).toBe("idle");
  await expect(page.locator("[data-selection-layer]")).toHaveCount(1);

  // Right-click on the frame → ContextMenu opens → mode becomes
  // "context-menu". With the gate in place, the SelectionLayer
  // unmounts.
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2, {
    button: "right",
  });
  await expect.poll(() => interactionMode(page)).toBe("context-menu");
  await expect(page.locator("[data-selection-layer]")).toHaveCount(0);

  // Dismiss the menu. Escape is flaky here — FrameStage's window-level
  // keydown handler (router.cancelActive) competes with Radix's own
  // Escape, so we click outside instead, which is the canonical
  // dismissal Radix' outside-pointer detector handles. Mode flips back
  // to idle and chrome returns.
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.mouse.click(2, 2);
  await expect.poll(() => interactionMode(page), { timeout: 5_000 }).toBe("idle");
  await expect(page.locator("[data-selection-layer]")).toHaveCount(1);
});

test("ContextMenu opening clears a stuck rubber-band reviewing slot", async ({ page }) => {
  // Set up two frames so right-click on either produces a layer-picker
  // or the legacy ContextMenu — both publish `context-menu` mode.
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 rubberband cleanup" });
  await addFrame(page, "frame", {
    frame: { x: 0.15, y: 0.15, width: 0.3, height: 0.3, rotation: 0 },
  });
  const frameId = await lastFrameId(page);
  const rect = await rectOfFrame(page, frameId);

  // Simulate the "stuck reviewing" condition directly. The rubber-band
  // binding normally enters this state on pointerup; we set the slot
  // through the vm to avoid the brittle pixel-perfect Alt-drag flow.
  await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: {
        rubberBand: {
          set: (slot: unknown) => void;
          get: () => unknown;
        };
      };
    };
    const vm = w.__weaveVm;
    if (vm === undefined) throw new Error("no __weaveVm");
    // Find the design root id — the rubber-band hostId. The design
    // plane registers as `String(root.id)` (FrameStage.tsx).
    const dw = window as unknown as { __weaveDoc?: { root: { id: unknown } } };
    const hostId = String(dw.__weaveDoc?.root.id ?? "");
    vm.rubberBand.set({
      hostId,
      containerId: hostId,
      phase: "reviewing",
      rectLocal: { x: 100, y: 100, width: 60, height: 60 },
      previewKind: null,
    });
  });

  // Confirm the slot got set.
  const setSlot = await page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { rubberBand: { get: () => unknown } };
    };
    return w.__weaveVm?.rubberBand.get() ?? null;
  });
  expect(setSlot).not.toBeNull();

  // Open the ContextMenu via a right-click on the frame. Mode flips
  // to "context-menu". RubberBandLayer's mode-watcher must clear the
  // slot because the popover would otherwise sit behind the menu.
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2, {
    button: "right",
  });
  await expect.poll(() => interactionMode(page)).toBe("context-menu");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const w = window as unknown as {
          __weaveVm?: { rubberBand: { get: () => unknown } };
        };
        return w.__weaveVm?.rubberBand.get() ?? null;
      }),
    )
    .toBeNull();
});

test("Peek (Layers) button hides SelectionLayer chrome + QuickActionBar; off restores", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 peek chrome" });
  await addFrame(page, "frame", {
    frame: { x: 0.2, y: 0.2, width: 0.4, height: 0.4, rotation: 0 },
  });
  const frameId = await lastFrameId(page);
  const rect = await rectOfFrame(page, frameId);

  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
  // All three affordances visible after selection.
  await expect(page.locator("[data-selection-layer]")).toHaveCount(1);
  await expect(page.getByTestId("hover-quick-actions")).toBeVisible();
  await expect(page.getByTestId("contextual-toolbar")).toBeVisible();

  // Toggle Peek (Layers) — the header button publishes peek.isActive.
  await page.getByTestId("toolbar-peek").click();
  await expect(page.getByTestId("toolbar-peek")).toHaveAttribute("aria-pressed", "true");
  // Selection chrome + QuickActionBar + ContextualToolbar all
  // disappear while peek owns the canvas.
  await expect(page.locator("[data-selection-layer]")).toHaveCount(0);
  await expect(page.getByTestId("hover-quick-actions")).toHaveCount(0);
  await expect(page.getByTestId("contextual-toolbar")).toHaveCount(0);

  // Toggle off — all three return.
  await page.getByTestId("toolbar-peek").click();
  await expect(page.getByTestId("toolbar-peek")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-selection-layer]")).toHaveCount(1);
  await expect(page.getByTestId("hover-quick-actions")).toBeVisible();
  await expect(page.getByTestId("contextual-toolbar")).toBeVisible();
});

test("ContextMenu on frame: frame-move binding refuses while menu is open", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed", title: "WI-040 ctx-menu drag" });
  await addFrame(page, "frame", {
    frame: { x: 0.25, y: 0.25, width: 0.3, height: 0.3, rotation: 0 },
  });
  const frameId = await lastFrameId(page);
  const rect = await rectOfFrame(page, frameId);

  // Right-click to open the menu — mode → "context-menu".
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2, {
    button: "right",
  });
  await expect.poll(() => interactionMode(page)).toBe("context-menu");

  // Press-and-drag on the frame body. Frame-move must not be
  // registered while the menu is open, so the press leaves the frame
  // in place. (The menu may close on its own outside-click — that's
  // fine; the assertion is that the frame's stored position is
  // unchanged at the end of the gesture.)
  await page.mouse.move(rect.left + 5, rect.top + 5);
  await page.mouse.down();
  await page.mouse.move(rect.left + 80, rect.top + 80, { steps: 6 });
  await page.mouse.up();

  const moved = await page.evaluate((id) => {
    const w = window as unknown as {
      __weaveDoc?: {
        root: {
          children: ReadonlyArray<{ id: unknown; attrs: { frame: { x: number; y: number } } }>;
        };
      };
    };
    const f = w.__weaveDoc?.root.children?.find((c) => String(c.id) === id);
    return f === undefined ? null : { x: f.attrs.frame.x, y: f.attrs.frame.y };
  }, frameId);
  if (moved === null) throw new Error("frame not found after ctx-menu drag attempt");
  expect(moved.x).toBeCloseTo(0.25, 5);
  expect(moved.y).toBeCloseTo(0.25, 5);
});
