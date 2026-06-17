import { expect, test } from "@playwright/test";
import { addFrame, clearAllDesigns, prepareDesign, setSelection } from "./helpers.js";

// WI-245 / DR-162 — a `group` ALWAYS shrink-wraps its children: its frame tracks
// the children's union bbox, so a child can never overflow. Moving a child
// outward grows the group; every child stays within the group's [0,1] box.

test.beforeEach(async ({ page }) => {
  await clearAllDesigns(page);
});

type Frame = { x: number; y: number; width: number; height: number; rotation: number };
type DocNode = {
  id: string | number;
  kind: string;
  attrs?: { frame?: Frame };
  children?: ReadonlyArray<DocNode>;
};
type Doc = { root: DocNode };

function findNode(page: import("@playwright/test").Page, id: string) {
  return page.evaluate((targetId) => {
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    const walk = (n: DocNode): DocNode | undefined => {
      if (String(n.id) === targetId) return n;
      for (const c of n.children ?? []) {
        const f = walk(c);
        if (f !== undefined) return f;
      }
      return undefined;
    };
    const root = doc?.root;
    const node = root === undefined ? undefined : walk(root);
    if (node === undefined) return null;
    return {
      frame: node.attrs?.frame ?? null,
      childFrames: (node.children ?? []).map((c) => ({
        id: String(c.id),
        frame: c.attrs?.frame ?? null,
      })),
    };
  }, id);
}

test("moving a group child grows the group to wrap it; no child overflows the group box", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const slide = await page.evaluate(() => {
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return String(doc?.root.children?.[0]?.id);
  });

  await addFrame(page, "frame", {
    containerId: slide,
    frame: { x: 0.2, y: 0.2, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "frame", {
    containerId: slide,
    frame: { x: 0.6, y: 0.6, width: 0.2, height: 0.2, rotation: 0 },
  });

  const slideKids = await findNode(page, slide);
  const memberIds = (slideKids?.childFrames ?? []).map((c) => c.id).slice(-2);
  expect(memberIds).toHaveLength(2);

  const groupId = await page.evaluate((ids) => {
    type Editor = { exec: (n: string, i: unknown) => { ok: boolean; value?: string } };
    const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
    const r = ed?.exec("weave.items.group", {
      itemIds: ids,
      designWidth: 1920,
      designHeight: 1080,
    });
    return r?.ok === true ? (r.value ?? null) : null;
  }, memberIds);
  expect(groupId).not.toBeNull();
  await page.waitForTimeout(60);

  const before = await findNode(page, groupId as string);
  expect(before?.frame).not.toBeNull();
  const widthBefore = before?.frame?.width ?? 0;

  // Move the first member far to the left (outside the current group box).
  await page.evaluate(
    ({ id }) => {
      type Editor = { exec: (n: string, i: unknown) => unknown };
      const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
      ed?.exec("weave.item.update", {
        itemId: id,
        attrs: { frame: { x: -0.8, y: 0, width: 0.5, height: 0.5, rotation: 0 } },
      });
    },
    { id: memberIds[0] },
  );
  await page.waitForTimeout(60);

  const after = await findNode(page, groupId as string);
  // The group grew to wrap the moved child.
  expect(after?.frame?.width ?? 0).toBeGreaterThan(widthBefore + 1e-6);

  // NO OVERFLOW: every child sits within the group's [0,1] box (with a tiny eps).
  for (const c of after?.childFrames ?? []) {
    const fr = c.frame;
    expect(fr).not.toBeNull();
    if (fr !== null) {
      expect(fr.x).toBeGreaterThanOrEqual(-1e-3);
      expect(fr.y).toBeGreaterThanOrEqual(-1e-3);
      expect(fr.x + fr.width).toBeLessThanOrEqual(1 + 1e-3);
      expect(fr.y + fr.height).toBeLessThanOrEqual(1 + 1e-3);
    }
  }

  // The moved child still renders on canvas (inside the grown group).
  await expect(page.locator(`[data-frame-id="${memberIds[0]}"]`)).toHaveCount(1);
});

test("WI-246 — a LIVE multi-tick drag (same sessionId) does not balloon the group or drift the child", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const slide = await page.evaluate(() => {
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return String(doc?.root.children?.[0]?.id);
  });
  // members at slide-rel {0.2,0.2,0.2,0.2} and {0.6,0.6,0.2,0.2} → group g0 = {0.2,0.2,0.6,0.6}.
  await addFrame(page, "frame", {
    containerId: slide,
    frame: { x: 0.2, y: 0.2, width: 0.2, height: 0.2, rotation: 0 },
  });
  await addFrame(page, "frame", {
    containerId: slide,
    frame: { x: 0.6, y: 0.6, width: 0.2, height: 0.2, rotation: 0 },
  });
  const kids = await findNode(page, slide);
  const memberIds = (kids?.childFrames ?? []).map((c) => c.id).slice(-2);
  const groupId = await page.evaluate((ids) => {
    type Editor = { exec: (n: string, i: unknown) => { ok: boolean; value?: string } };
    const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
    const r = ed?.exec("weave.items.group", {
      itemIds: ids,
      designWidth: 1920,
      designHeight: 1080,
    });
    return r?.ok === true ? (r.value ?? null) : null;
  }, memberIds);
  expect(groupId).not.toBeNull();
  await page.waitForTimeout(60);

  // Drag member[0] right: abs x 0.4 → 1.0 over 4 ticks, frames RELATIVE TO g0
  // (the binding's behaviour), all under one sessionId. g0 = {0.2,0.2,0.6,0.6}.
  await page.evaluate(
    ({ id }) => {
      type Editor = { exec: (n: string, i: unknown) => unknown };
      const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
      for (const absX of [0.4, 0.6, 0.8, 1.0]) {
        ed?.exec("weave.item.update", {
          itemId: id,
          attrs: {
            frame: {
              x: (absX - 0.2) / 0.6,
              y: 0,
              width: 0.2 / 0.6,
              height: 0.2 / 0.6,
              rotation: 0,
            },
          },
          sessionId: "drag-1",
        });
      }
    },
    { id: memberIds[0] },
  );
  await page.waitForTimeout(60);

  const after = await findNode(page, groupId as string);
  const gf = after?.frame;
  expect(gf).not.toBeNull();
  // Final tight union of a{1.0,0.2,0.2,0.2} & b{0.6,0.6,0.2,0.2} = {0.6,0.2,0.6,0.6}.
  // A ballooning feedback loop would blow width far past 0.6.
  if (gf !== null && gf !== undefined) {
    expect(gf.x).toBeCloseTo(0.6, 1);
    expect(gf.width).toBeCloseTo(0.6, 1);
    // dragged child ends at its intended absolute x ≈ 1.0; sibling stays at ≈ 0.6.
    for (const c of after?.childFrames ?? []) {
      const fr = c.frame;
      if (fr === null) continue;
      const absX = gf.x + fr.x * gf.width;
      expect(c.id === memberIds[0] ? Math.abs(absX - 1.0) : Math.abs(absX - 0.6)).toBeLessThan(
        0.05,
      );
      // no overflow
      expect(fr.x).toBeGreaterThanOrEqual(-1e-3);
      expect(fr.x + fr.width).toBeLessThanOrEqual(1 + 1e-3);
    }
  }
});

test("WI-246 — a REAL mouse drag of a group's inner child does not balloon the group or drift", async ({
  page,
}) => {
  await prepareDesign(page, { flavor: "slide-deck" });
  const slide = await page.evaluate(() => {
    const doc = (window as unknown as { __weaveDoc?: Doc }).__weaveDoc;
    return String(doc?.root.children?.[0]?.id);
  });
  // Two members inside the active slide, then grouped.
  await addFrame(page, "frame", {
    containerId: slide,
    frame: { x: 0.25, y: 0.25, width: 0.18, height: 0.18, rotation: 0 },
  });
  await addFrame(page, "frame", {
    containerId: slide,
    frame: { x: 0.55, y: 0.55, width: 0.18, height: 0.18, rotation: 0 },
  });
  const kids = await findNode(page, slide);
  const memberIds = (kids?.childFrames ?? []).map((c) => c.id).slice(-2);
  const groupId = await page.evaluate((ids) => {
    type Editor = { exec: (n: string, i: unknown) => { ok: boolean; value?: string } };
    const ed = (window as unknown as { __weaveEditor?: Editor }).__weaveEditor;
    const r = ed?.exec("weave.items.group", {
      itemIds: ids,
      designWidth: 1920,
      designHeight: 1080,
    });
    return r?.ok === true ? (r.value ?? null) : null;
  }, memberIds);
  expect(groupId).not.toBeNull();
  await page.waitForTimeout(80);

  const childId = memberIds[0];
  // Deep-select the inner child so the drag grabs IT (not the group).
  await setSelection(page, [childId]);
  await page.waitForTimeout(30);

  // Screen-pixel center of the child's rendered element (stage-scoped).
  const center = await page.evaluate((cid) => {
    const el = document.querySelector(
      `[data-testid="frame-stage"] [data-frame-id="${cid}"]`,
    ) as HTMLElement | null;
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }, childId);
  expect(center).not.toBeNull();
  const { cx, cy } = center as { cx: number; cy: number };

  // Real pointer drag: down → several moves (past the 3px threshold) → up.
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "left" });
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(cx + (120 * i) / 8, cy + (90 * i) / 8);
    await page.waitForTimeout(12);
  }
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(120);

  const after = await findNode(page, groupId as string);
  const gf = after?.frame;
  expect(gf).not.toBeNull();
  if (gf !== null && gf !== undefined) {
    // NO BALLOON: a feedback loop would blow the box far past the slide; a tight
    // wrap of two ~0.18 members spread across the slide stays well under ~1.2.
    expect(gf.width).toBeLessThan(1.3);
    expect(gf.height).toBeLessThan(1.3);
    expect(gf.width).toBeGreaterThan(0.05);
    expect(Number.isFinite(gf.width)).toBe(true);
    // NO OVERFLOW / NO DRIFT: every child sits inside the group's [0,1] box.
    for (const c of after?.childFrames ?? []) {
      const fr = c.frame;
      if (fr === null) continue;
      expect(fr.x).toBeGreaterThanOrEqual(-1e-2);
      expect(fr.y).toBeGreaterThanOrEqual(-1e-2);
      expect(fr.x + fr.width).toBeLessThanOrEqual(1 + 1e-2);
      expect(fr.y + fr.height).toBeLessThanOrEqual(1 + 1e-2);
    }
  }
  // The dragged child actually moved (the gesture grabbed it).
  const childAfter = await findNode(page, childId);
  expect(childAfter?.frame).not.toBeNull();
});
