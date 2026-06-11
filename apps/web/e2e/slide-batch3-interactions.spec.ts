// biome-ignore-all lint/style/noNonNullAssertion: Playwright e2e — `!` asserts presence of test globals (window.__weave*) and locator results; the nn() helper cannot cross the page.evaluate() boundary into the browser context
// WI-185 — Batch 3: coordinate contracts, group, and standard menus
// (SLIDE_DECK_INTERACTION_SPEC §4 items ⑫–⑱). ⑫ (paste coord D-5) is pinned
// by clipboard-items.spec.ts + paste-coord unit tests; this spec covers the
// rest: smart duplicate, Cmd+G/Cmd+Shift+G, the element / page / rail-tile
// context menus, OS-clipboard image paste, and Shift+2 zoom-to-selection.

import { expect, type Page, test } from "@playwright/test";
import {
  addFrame,
  clearAllDesigns,
  prepareDesign,
  readItemFrame,
  readParentInfo,
  setSelection,
} from "./helpers.js";

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

/** Root children ids, in document order. */
async function rootChildIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Doc = { root: { children: ReadonlyArray<{ id: unknown }> } };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return doc?.root.children.map((c) => String(c.id)) ?? [];
  });
}

/** `attrs.locked === true` for the item (DR-061 lock flag). */
async function readLocked(page: Page, id: string): Promise<boolean> {
  return page.evaluate((targetId) => {
    interface Node {
      readonly id: unknown;
      readonly attrs: Record<string, unknown>;
      readonly children: ReadonlyArray<Node>;
    }
    type Doc = { root: Node };
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    if (doc === undefined) return false;
    function find(node: Node): Node | null {
      if (String(node.id) === targetId) return node;
      for (const c of node.children) {
        const inner = find(c);
        if (inner !== null) return inner;
      }
      return null;
    }
    return (find(doc.root)?.attrs as { locked?: boolean } | undefined)?.locked === true;
  }, id);
}

/** True multi-selection — helpers' setSelection falls back to repeated
 *  `set()` (last-wins single) when `addMany` is absent; the vm's real
 *  multi API is `setMany` (same call multi-toolbar.spec.ts uses). */
async function setMultiSelection(page: Page, ids: ReadonlyArray<string>): Promise<void> {
  await page.evaluate((targets) => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { setMany: (xs: Iterable<unknown>) => void } };
    };
    w.__weaveVm?.itemSelection.setMany(targets);
  }, ids);
}

/** Current single-selection item id, or "" when not a single selection. */
async function readSingleSelection(page: Page): Promise<string> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __weaveVm?: { itemSelection: { state: { get: () => unknown } } };
    };
    const s = w.__weaveVm?.itemSelection.state.get() as
      | { kind: "single"; itemId: unknown }
      | undefined;
    return s?.kind === "single" ? String(s.itemId) : "";
  });
}

/** Shift the item's frame by (dx, dy) in ratio units via the same
 *  weave.item.update path a drag uses. */
async function nudgeFrame(page: Page, id: string, dx: number, dy: number): Promise<void> {
  await page.evaluate(
    ({ id, dx, dy }) => {
      interface Node {
        readonly id: unknown;
        readonly attrs: Record<string, unknown>;
        readonly children: ReadonlyArray<Node>;
      }
      type Doc = { root: Node };
      type Editor = { exec: (name: string, input: unknown) => unknown };
      const w = window as unknown as { __weaveDoc?: Doc; __weaveEditor?: Editor };
      const doc = w.__weaveDoc;
      if (doc === undefined) return;
      function find(node: Node): Node | null {
        if (String(node.id) === id) return node;
        for (const c of node.children) {
          const inner = find(c);
          if (inner !== null) return inner;
        }
        return null;
      }
      const frame = (find(doc.root)?.attrs as { frame?: Record<string, number> } | undefined)
        ?.frame;
      if (frame === undefined) return;
      w.__weaveEditor?.exec("weave.item.update", {
        itemId: id,
        attrs: { frame: { ...frame, x: frame.x + dx, y: frame.y + dy } },
      });
    },
    { id, dx, dy },
  );
}

test("⑬ Cmd+D repeats the source→clone delta (office duplicate rhythm)", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.15, height: 0.15, rotation: 0 },
  });
  const [src] = await rootChildIds(page);
  await setSelection(page, [src!]);

  // First Cmd+D — default offset clone, lands selected.
  await page.keyboard.press("ControlOrMeta+d");
  await expect.poll(() => rootChildIds(page).then((ids) => ids.length)).toBe(2);
  const clone1 = (await rootChildIds(page)).find((id) => id !== src)!;

  // Move the clone — the NEXT Cmd+D must repeat the *moved* delta, not the
  // default offset (the smart part: source→clone is measured live).
  await nudgeFrame(page, clone1, 0.18, 0.07);
  const srcF = (await readItemFrame(page, src!))!;
  const c1F = (await readItemFrame(page, clone1))!;

  await page.keyboard.press("ControlOrMeta+d");
  await expect.poll(() => rootChildIds(page).then((ids) => ids.length)).toBe(3);
  const clone2 = (await rootChildIds(page)).find((id) => id !== src && id !== clone1)!;
  const c2F = (await readItemFrame(page, clone2))!;

  // Even series: clone2 - clone1 == clone1 - src on both axes.
  expect(c2F.x - c1F.x).toBeCloseTo(c1F.x - srcF.x, 5);
  expect(c2F.y - c1F.y).toBeCloseTo(c1F.y - srcF.y, 5);
});

test("⑭ Cmd+G wraps the selection in a frame; Cmd+Shift+G dissolves; both undoable", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.15, height: 0.15, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.5, y: 0.5, width: 0.15, height: 0.15, rotation: 0 },
  });
  const [a, b] = await rootChildIds(page);
  const rootBefore = await readParentInfo(page, a!);

  await setMultiSelection(page, [a!, b!]);
  await page.keyboard.press("ControlOrMeta+g");
  // Both items share a NEW parent frame (not the design root).
  await expect
    .poll(async () => {
      const pa = await readParentInfo(page, a!);
      const pb = await readParentInfo(page, b!);
      return pa !== null && pb !== null && pa.parentId === pb.parentId
        ? pa.parentId
        : "(unwrapped)";
    })
    .not.toBe("(unwrapped)");
  const groupId = (await readParentInfo(page, a!))!.parentId;
  expect(groupId).not.toBe(rootBefore!.parentId);

  // Step past the history merge window so dissolve is its own transaction.
  await page.waitForTimeout(600);

  // Cmd+Shift+G dissolves the group — children return to the root.
  await page.keyboard.press("ControlOrMeta+Shift+g");
  await expect
    .poll(() => readParentInfo(page, a!).then((p) => p?.parentId ?? ""))
    .toBe(rootBefore!.parentId);
  expect((await readParentInfo(page, b!))!.parentId).toBe(rootBefore!.parentId);

  // History contract: one undo re-groups, a second undo un-groups.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => readParentInfo(page, a!).then((p) => p?.parentId ?? "")).toBe(groupId);
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => readParentInfo(page, a!).then((p) => p?.parentId ?? ""))
    .toBe(rootBefore!.parentId);
});

test("⑮ element right-click menu: duplicate / group / ungroup / lock rows", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  await addFrame(page, "frame", {
    frame: { x: 0.1, y: 0.1, width: 0.18, height: 0.18, rotation: 0 },
  });
  await addFrame(page, "frame", {
    frame: { x: 0.55, y: 0.1, width: 0.18, height: 0.18, rotation: 0 },
  });
  const [a, b] = await rootChildIds(page);
  const stageFrame = (id: string) =>
    page.locator(`[data-testid="frame-stage"] [data-frame-id="${id}"]`).first();

  // ── Group: multi-select both, right-click a member → "그룹".
  await setMultiSelection(page, [a!, b!]);
  await stageFrame(a!).click({ button: "right" });
  await expect(page.getByTestId("ctx-group")).toBeVisible();
  await page.getByTestId("ctx-group").click();
  await expect
    .poll(async () => {
      const pa = await readParentInfo(page, a!);
      const pb = await readParentInfo(page, b!);
      return pa !== null && pa.parentId === pb?.parentId ? pa.parentId : "(unwrapped)";
    })
    .not.toBe("(unwrapped)");
  const groupId = (await readParentInfo(page, a!))!.parentId;

  // ── Ungroup: right-click the group frame → "그룹 해제".
  // Two traps here: (1) grouping selects the new group, whose chrome
  // resize handles swallow corner clicks — clear the selection first;
  // (2) the children cover the group's left/right thirds, and a click on
  // a child opens the CHILD's menu (every frame offers 그룹 해제) — so
  // aim at the group's centre, the gap between the two members, which is
  // the group's own background.
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const w = window as unknown as { __weaveVm?: { itemSelection: { clear: () => void } } };
    w.__weaveVm?.itemSelection.clear();
  });
  await stageFrame(groupId).click({ button: "right" });
  await expect(page.getByTestId("ctx-ungroup")).toBeVisible();
  await page.getByTestId("ctx-ungroup").click();
  await expect
    .poll(() => rootChildIds(page).then((ids) => (ids.includes(a!) ? "root" : "nested")))
    .toBe("root");

  // ── Duplicate: right-click a single item → "복제" (count +1, clone selected).
  const idsBeforeDup = await rootChildIds(page);
  await setSelection(page, [a!]);
  await stageFrame(a!).click({ button: "right" });
  await expect(page.getByTestId("ctx-duplicate")).toBeVisible();
  await page.getByTestId("ctx-duplicate").click();
  await expect
    .poll(() => rootChildIds(page).then((ids) => ids.length))
    .toBe(idsBeforeDup.length + 1);
  // Park the clone away from `a` — it lands offset on top of the source
  // and would intercept the next right-click.
  const cloneId = (await rootChildIds(page)).find((id) => !idsBeforeDup.includes(id));
  if (cloneId !== undefined) await nudgeFrame(page, cloneId, 0.4, 0.5);

  // ── Lock: right-click → "잠금"; re-open shows "잠금 해제" and unlocks.
  await page.waitForTimeout(600);
  await setSelection(page, [a!]);
  await stageFrame(a!).click({ button: "right" });
  await expect(page.getByTestId("ctx-lock")).toContainText("잠금");
  await page.getByTestId("ctx-lock").click();
  await expect.poll(() => readLocked(page, a!)).toBe(true);
  await page.waitForTimeout(600);
  await stageFrame(a!).click({ button: "right" });
  await expect(page.getByTestId("ctx-lock")).toContainText("잠금 해제");
  await page.getByTestId("ctx-lock").click();
  await expect.poll(() => readLocked(page, a!)).toBe(false);
});

test("⑯ empty-slide right-click: Paste(비활성)·New slide·배경 — element verbs absent", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  const [pageId] = await rootChildIds(page);
  const stagePage = page.locator(`[data-testid="frame-stage"] [data-frame-id="${pageId}"]`).first();

  // The page (stage role) gets the PAGE menu, not the element menu.
  await stagePage.click({ button: "right", position: { x: 200, y: 150 } });
  await expect(page.getByTestId("page-ctx-new-page")).toBeVisible();
  await expect(page.getByTestId("ctx-delete-frame")).toHaveCount(0);
  // Empty clipboard → paste row disabled.
  await expect(page.getByTestId("page-ctx-paste")).toHaveAttribute("aria-disabled", "true");

  // 새 슬라이드 — lands right after this page and becomes active (rail parity).
  await page.getByTestId("page-ctx-new-page").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
  await expect(page.getByTestId("thumbnail-activate-1")).toHaveAttribute("aria-pressed", "true");

  // 배경 변경 — selects the page so the contextual toolbar's background
  // section surfaces (WI-163 escape-hatch selection path).
  const newPageId = (await rootChildIds(page)).find((id) => id !== pageId)!;
  const newStagePage = page
    .locator(`[data-testid="frame-stage"] [data-frame-id="${newPageId}"]`)
    .first();
  await newStagePage.click({ button: "right", position: { x: 200, y: 150 } });
  await page.getByTestId("page-ctx-background").click();
  await expect.poll(() => readSingleSelection(page)).toBe(newPageId);
});

test("⑯ rail tile menu: New/Duplicate/Delete/배경 (+ last-page delete guard)", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();

  // Deck of one: the delete row is disabled (≥1 page invariant).
  await page.getByTestId("thumbnail-0").click({ button: "right" });
  await expect(page.getByTestId("thumbnail-menu-delete-0")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  // 새 페이지 — inserts right AFTER the tile and becomes active.
  await page.getByTestId("thumbnail-menu-new-0").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);
  await expect(page.getByTestId("thumbnail-activate-1")).toHaveAttribute("aria-pressed", "true");

  // 복제 from the menu (same path as the hover button).
  await page.getByTestId("thumbnail-1").click({ button: "right" });
  await page.getByTestId("thumbnail-menu-duplicate-1").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(3);

  // 삭제 from the menu.
  await page.getByTestId("thumbnail-2").click({ button: "right" });
  await page.getByTestId("thumbnail-menu-delete-2").click();
  await expect(page.locator("[data-thumbnail-id]")).toHaveCount(2);

  // 배경 변경 — activates + selects that page.
  const railIds = await page
    .locator("[data-thumbnail-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-frame-id") ?? ""));
  await page.getByTestId("thumbnail-0").click({ button: "right" });
  await page.getByTestId("thumbnail-menu-background-0").click();
  await expect.poll(() => readSingleSelection(page)).toBe(railIds[0]);
  await expect(page.getByTestId("thumbnail-activate-0")).toHaveAttribute("aria-pressed", "true");
});

test("⑰ OS-clipboard image paste inserts an image item into the active page", async ({ page }) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  await expect(page.getByTestId("thumbnail-0")).toBeVisible();
  const [pageId] = await rootChildIds(page);

  // Synthesize the native `paste` event with an image File — the path the
  // browser takes when the editor-hotkeys probe finds the internal
  // clipboard EMPTY and skips preventDefault.
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#3b82f6";
    ctx.fillRect(0, 0, 8, 8);
    const dataUrl = canvas.toDataURL("image/png");
    const bytes = atob(dataUrl.split(",")[1]!);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    const file = new File([buf], "e2e-paste.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt }));
  });

  // Offline e2e server → cloud upload fails → data: URL fallback. The item
  // lands INSIDE the active page (InsertionPolicy container resolution).
  const findImageId = () =>
    page.evaluate(() => {
      interface Node {
        readonly id: unknown;
        readonly kind: string;
        readonly attrs: Record<string, unknown>;
        readonly children: ReadonlyArray<Node>;
      }
      type Doc = { root: Node };
      const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
      if (doc === undefined) return "";
      function find(node: Node): Node | null {
        if (node.kind === "image") return node;
        for (const c of node.children) {
          const inner = find(c);
          if (inner !== null) return inner;
        }
        return null;
      }
      const img = find(doc.root);
      if (img === null) return "";
      const src = (img.attrs as { src?: string }).src ?? "";
      return src.startsWith("data:image/") ? String(img.id) : "";
    });
  await expect.poll(findImageId, { timeout: 5000 }).not.toBe("");
  const imageId = await findImageId();
  expect((await readParentInfo(page, imageId))!.parentId).toBe(pageId);
});

test("⑱ Shift+2 zooms the camera to the current selection", async ({ page }) => {
  await prepareDesign(page, { flavor: "mixed" });
  // After prepareDesign — emulateMedia before the initial goto starves the
  // page's `networkidle` wait (prepareDesign hangs deterministically).
  await page.emulateMedia({ reducedMotion: "reduce" });
  // A small frame in the top-left — fitting it must zoom in well past the
  // initial whole-plane fit.
  await addFrame(page, "frame", {
    frame: { x: 0.05, y: 0.05, width: 0.12, height: 0.12, rotation: 0 },
  });
  const [id] = await rootChildIds(page);
  const rect = () =>
    page.evaluate((fid) => {
      const el = document.querySelector(`[data-testid="frame-stage"] [data-frame-id="${fid}"]`);
      if (el === null) return { width: 0, left: 0, top: 0, right: 0, bottom: 0 };
      const r = el.getBoundingClientRect();
      return { width: r.width, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }, id!);
  const before = (await rect()).width;
  expect(before).toBeGreaterThan(0);

  await setSelection(page, [id!]);
  await page.keyboard.press("Shift+Digit2");

  await expect
    .poll(() => rect().then((r) => r.width), { timeout: 4000 })
    .toBeGreaterThan(before * 1.5);
  // The fitted frame sits within the viewport.
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const r = await rect();
  expect(r.left).toBeGreaterThanOrEqual(-2);
  expect(r.top).toBeGreaterThanOrEqual(-2);
  expect(r.right).toBeLessThanOrEqual(vp.w + 2);
  expect(r.bottom).toBeLessThanOrEqual(vp.h + 2);
});
